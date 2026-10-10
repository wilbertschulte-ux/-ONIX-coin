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
  buildMiniAppUrl,
  extractTelegramStartPayload,
  parseLaunchParam,
} = require('./trafficAttribution');
const { queueTrafficEvent } = require('./trafficEvents');
const { trackAnalyticsEvent } = require('./analytics');
const { storePendingTelegramLaunch } = require('./trustedTelegramLaunch');
require("dotenv").config();

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

mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("MongoDB connected");
})
.catch((err) => {
    console.log(err);
});

app.get("/", (req, res) => {
    res.send("ONIX backend working");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
