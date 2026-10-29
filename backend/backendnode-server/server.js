require("dotenv").config();

const { translate, getUserLanguage } = require('./i18n');
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const {
  createTelegramWebhookRateLimiter,
  verifyTelegramWebhookSecret,
} = require('./telegramWebhookSecurity');
const {
  createDeploymentIsolationConfig,
  verifyStagingTelegramBotIdentity,
} = require('./deploymentIsolation');
const { getSafeStartupFailure } = require('./startupDiagnostics');
const {
  buildMiniAppUrl,
  extractTelegramStartPayload,
  parseLaunchParam,
} = require('./trafficAttribution');
const { queueTrafficEvent } = require('./trafficEvents');
const { trackAnalyticsEvent } = require('./analytics');
const { storePendingTelegramLaunch } = require('./trustedTelegramLaunch');

const app = express();

app.use(cors());
app.use(express.json());

const coinRoutes = require("./routes/coinRoutes");
const User = require("./models/User");

app.use("/api/coins", coinRoutes);

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || "https://onix-coin.vercel.app";
const telegramWebhookRateLimiter = createTelegramWebhookRateLimiter();

async function sendTelegramMessage(chatId, text, replyMarkup) {
  if (!BOT_TOKEN) {
    console.log("BOT_TOKEN is missing");
    return;
  }

  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

function getStartKeyboard(language = 'de', launchParam = '') {
  return {
    inline_keyboard: [
      [
        {
          text: translate('bot.open', language),
          web_app: {
            url: buildMiniAppUrl(WEB_APP_URL, launchParam),
          },
        },
      ],
    ],
  };
}

// Telegram webhook for /start and simple bot entry.
app.post(
  "/api/telegram/webhook",
  telegramWebhookRateLimiter,
  verifyTelegramWebhookSecret,
  async (req, res) => {
  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();

    if (!chatId) {
      return res.sendStatus(200);
    }

    const language = await getUserLanguage(User, message?.from?.id);

    if (text.startsWith("/start") || text.startsWith("/help")) {
      const startPayload = text.startsWith('/start')
        ? extractTelegramStartPayload(text)
        : '';
      const parsedLaunch = parseLaunchParam(startPayload);
      let keyboardLaunchParam = '';

      if (startPayload) {
        const pendingLaunch = await storePendingTelegramLaunch({
          telegramId: message?.from?.id,
          payload: startPayload,
        });
        if (pendingLaunch.stored || pendingLaunch.existing) {
          keyboardLaunchParam = startPayload;
        } else if (pendingLaunch.reason === 'storage_error') {
          console.warn('Pending Telegram launch storage failed');
        }
      }

      queueTrafficEvent({
        telegramId: message?.from?.id,
        event: 'landing',
        attribution: parsedLaunch.attribution,
        deduplicationKey: parsedLaunch.attribution?.landingCode || '',
      });
      trackAnalyticsEvent({
        telegramId: message?.from?.id,
        event: 'landing',
        attribution: parsedLaunch.attribution,
        occurredAt: Date.now(),
        deduplicationKey: parsedLaunch.attribution?.landingCode || 'first',
      });

      await sendTelegramMessage(
        chatId,
        [
          translate('bot.welcome', language),
          "",
          translate('bot.description', language),
          "",
          translate('bot.prompt', language),
        ].join("\n"),
        getStartKeyboard(language, keyboardLaunchParam)
      );

      return res.sendStatus(200);
    }

    await sendTelegramMessage(
      chatId,
      translate('bot.other', language),
      getStartKeyboard(language)
    );

    return res.sendStatus(200);
  } catch (error) {
    console.log("Telegram webhook error:", error?.response?.data || error.message);
    return res.sendStatus(200);
  }
  }
);

app.get("/", (req, res) => {
    res.send("ONIX backend working");
});

const PORT = process.env.PORT || 5000;

function listen() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT);
    const handleStartupError = (error) => reject(error);
    server.once('error', handleStartupError);
    server.once('listening', () => {
      server.off('error', handleStartupError);
      console.log(`Server started on port ${PORT}`);
      resolve(server);
    });
  });
}

async function requestTelegramBotIdentity(botToken) {
  return axios.get(`https://api.telegram.org/bot${botToken}/getMe`, {
    timeout: 10_000,
    maxRedirects: 0,
  });
}

let startupStage = 'deployment-config';

async function bootstrap() {
  startupStage = 'deployment-config';
  const isolation = createDeploymentIsolationConfig(process.env);

  if (!isolation.staging) {
    // Preserve the existing production startup behavior unless staging is
    // explicitly selected through ONIX_DEPLOY_ENV.
    mongoose.connect(process.env.MONGO_URI)
      .then(() => {
        console.log("MongoDB connected");
      })
      .catch((err) => {
        console.log(err);
      });
    startupStage = 'http-listen';
    await listen();
    return;
  }

  // This is the only Telegram API request allowed before the staging server
  // starts listening. It verifies that BOT_TOKEN belongs to the configured
  // staging bot, without logging or returning the token.
  startupStage = 'telegram-bot-verification';
  await verifyStagingTelegramBotIdentity(isolation, requestTelegramBotIdentity);
  startupStage = 'mongodb-connect';
  await mongoose.connect(isolation.mongoUri);
  console.log("Staging isolation verified and MongoDB connected");
  startupStage = 'http-listen';
  await listen();
}

bootstrap().catch((error) => {
  const failure = getSafeStartupFailure(startupStage, error);
  console.error(
    `Server startup blocked by deployment isolation: stage=${failure.stage} code=${failure.code}`
  );
  process.exitCode = 1;
});
