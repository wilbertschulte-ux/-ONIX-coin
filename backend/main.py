import asyncio
import time
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import Command
import aiosqlite

TOKEN = "8679190095:AAF6nNgVvs3IZ7yI5IDJYpncZkBKrixc5UA"

bot = Bot(token=TOKEN)
dp = Dispatcher()

DB_NAME = 'clicker.db'
db_lock = asyncio.Lock()

# ====================== БАЗА ДАННЫХ ======================
async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            energy INTEGER DEFAULT 2000,
            max_energy INTEGER DEFAULT 2000,
            autoclickers INTEGER DEFAULT 0,
            last_save INTEGER DEFAULT 0,
            last_energy_update INTEGER DEFAULT 0
        )''')
        await db.commit()

async def get_user(user_id: int):
    async with db_lock:
        async with aiosqlite.connect(DB_NAME) as db:
            async with db.execute(
                "SELECT balance, energy, max_energy, autoclickers, last_save, last_energy_update FROM users WHERE user_id = ?", 
                (user_id,)
            ) as cursor:
                result = await cursor.fetchone()

            now = int(time.time())
            if result:
                balance, energy, max_energy, autoclickers, last_save, last_energy_update = result
                
                # Восстановление энергии
                time_passed = now - last_energy_update
                energy = min(max_energy, energy + time_passed * 10)
                
                # Оффлайн прибыль
                offline_time = now - last_save
                balance += offline_time * autoclickers

                await db.execute(
                    "UPDATE users SET balance=?, energy=?, last_save=?, last_energy_update=? WHERE user_id=?",
                    (balance, energy, now, now, user_id)
                )
                await db.commit()
                return balance, energy, max_energy, autoclickers
            else:
                await db.execute(
                    "INSERT INTO users (user_id, last_save, last_energy_update) VALUES (?, ?, ?)",
                    (user_id, now, now)
                )
                await db.commit()
                return 0, 2000, 2000, 0


async def save_user(user_id: int, balance: int, energy: int, autoclickers: int):
    async with db_lock:
        async with aiosqlite.connect(DB_NAME) as db:
            now = int(time.time())
            await db.execute("""INSERT OR REPLACE INTO users 
                (user_id, balance, energy, max_energy, autoclickers, last_save, last_energy_update)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (user_id, balance, energy, 2000, autoclickers, now, now))
            await db.commit()


# ====================== ХЕНДЛЕРЫ ======================
@dp.message(Command("start"))
async def start(message: Message):
    balance, energy, max_energy, autoclickers = await get_user(message.from_user.id)
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🚀 ИГРАТЬ В ONIX COIN",
            web_app=WebAppInfo(url="https://example.com")  # Позже заменим
        )
    ]])
    
    await message.answer(
        f"🎮 <b>ONIX COIN</b>\n\n"
        f"Привет, {message.from_user.first_name}!\n\n"
        f"💰 Баланс: <b>{balance:,}</b> ONIX\n"
        f"⚡ Энергия: <b>{energy}</b>/{max_energy}\n"
        f"⚙️ Автоприбыль: <b>{autoclickers}</b>/сек\n\n"
        f"Нажми кнопку ниже, чтобы открыть игру:",
        reply_markup=keyboard,
        parse_mode="HTML"
    )


# ====================== ЗАПУСК ======================
async def main():
    await init_db()
    print("🚀 ONIX COIN успешно запущен!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())