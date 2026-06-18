const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const coinRoutes = require("./routes/coinRoutes");

app.use("/api/coins", coinRoutes);

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || "https://onix-coin.vercel.app";

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

function getStartKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 ONIX COIN öffnen",
          web_app: {
            url: WEB_APP_URL,
          },
        },
      ],
    ],
  };
}

// Telegram webhook for /start and simple bot entry.
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();

    if (!chatId) {
      return res.sendStatus(200);
    }

    if (text.startsWith("/start") || text.startsWith("/help")) {
      await sendTelegramMessage(
        chatId,
        [
          "⚡ <b>Willkommen bei ONIX COIN!</b>",
          "",
          "Tippe auf die Münze, verbessere deinen Miner, erledige Aufgaben, lade Freunde ein und steige im Ranking auf.",
          "",
          "Drücke unten auf den Button, um die App zu öffnen 👇",
        ].join("\n"),
        getStartKeyboard()
      );

      return res.sendStatus(200);
    }

    await sendTelegramMessage(
      chatId,
      "🚀 Drücke unten auf den Button, um ONIX COIN zu öffnen.",
      getStartKeyboard()
    );

    return res.sendStatus(200);
  } catch (error) {
    console.log("Telegram webhook error:", error?.response?.data || error.message);
    return res.sendStatus(200);
  }
});

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
