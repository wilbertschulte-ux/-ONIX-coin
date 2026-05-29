import React, { useState, useEffect } from 'react';
import { Zap, Trophy, Home, Star, Wallet, UserCircle, Rocket, Menu, Bell } from 'lucide-react';
import WebApp from '@twa-dev/sdk';
import axios from 'axios';
import onixLogoCrystal from './assets/onix-logo-crystal.webp';
import onixTapCrystal from './assets/onix-tap-coin-exact.webp';

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}


const ONIX_THEME_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800;900&family=Orbitron:wght@600;700;800;900&display=swap');

:root {
  --onix-bg-main: #080F17;
  --onix-bg-card: #111827;
  --onix-bg-soft: #1A1F2E;
  --onix-bg-deep: #0F1115;

  --onix-purple: #885CF6;
  --onix-violet: #A855F7;
  --onix-deep-purple: #5B21F6;
  --onix-cyan: #06B6D4;
  --onix-cyan-bright: #00E5FF;
  --onix-gold: #FACC15;

  --onix-text-main: #F8FAFC;
  --onix-text-muted: #94A3B8;
  --onix-border: rgba(136, 92, 246, 0.28);
  --onix-border-cyan: rgba(6, 182, 212, 0.28);
}

* {
  -webkit-tap-highlight-color: transparent;
}

body {
  background: #080F17;
}

.onix-app-bg {
  font-family: 'Exo 2', 'Inter', system-ui, sans-serif;
  background:
    radial-gradient(circle at 12% -8%, rgba(136, 92, 246, 0.22), transparent 28%),
    radial-gradient(circle at 88% 6%, rgba(6, 182, 212, 0.14), transparent 26%),
    radial-gradient(circle at 50% 100%, rgba(91, 33, 246, 0.18), transparent 38%),
    linear-gradient(180deg, #080F17 0%, #0A0F1C 45%, #050914 100%);
  color: var(--onix-text-main);
  position: relative;
  overflow-x: hidden;
}

.onix-app-bg::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.38;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.16) 0 1px, transparent 1px),
    radial-gradient(circle at 76% 18%, rgba(0,229,255,0.22) 0 1px, transparent 1px),
    radial-gradient(circle at 62% 76%, rgba(168,85,247,0.18) 0 1px, transparent 1px);
  background-size: 140px 140px, 220px 220px, 180px 180px;
}

.onix-header {
  background: rgba(8, 15, 23, 0.86) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.22);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 48px rgba(0,0,0,0.35);
}

.onix-brand-mark {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.22), transparent 54%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(8, 15, 23, 0.98));
  border: 1px solid rgba(136, 92, 246, 0.45);
  box-shadow:
    0 0 24px rgba(136, 92, 246, 0.55),
    0 0 34px rgba(6, 182, 212, 0.24),
    inset 0 0 22px rgba(136, 92, 246, 0.12);
  position: relative;
}

.onix-brand-mark::before,
.onix-brand-mark::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 36px;
  border: 1px solid rgba(136, 92, 246, 0.55);
  opacity: 0.8;
}

.onix-brand-mark::before {
  left: -9px;
  transform: skewY(-28deg);
  border-right: 0;
}

.onix-brand-mark::after {
  right: -9px;
  transform: skewY(28deg);
  border-left: 0;
}

.onix-crystal-svg {
  display: block;
  overflow: visible;
}

.onix-crystal-svg-tap {
  width: 68%;
  height: 68%;
  filter:
    drop-shadow(0 0 12px rgba(0, 229, 255, 0.75))
    drop-shadow(0 0 28px rgba(136, 92, 246, 0.75));
  animation: onixCrystalFloat 3.2s ease-in-out infinite;
}

.onix-brand-title {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.36);
}

.onix-energy-pill {
  background: rgba(17, 24, 39, 0.82) !important;
  border: 1px solid rgba(6, 182, 212, 0.28);
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.16);
}

.onix-balance-number {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  background: linear-gradient(90deg, #FFFFFF 0%, #B7F9FF 36%, #A855F7 72%, #FACC15 100%);
  -webkit-background-clip: text;
  color: transparent !important;
  text-shadow: 0 0 28px rgba(136, 92, 246, 0.22);
}

.onix-nav {
  background: rgba(8, 15, 23, 0.82) !important;
  border: 1px solid rgba(136, 92, 246, 0.24);
  box-shadow:
    0 18px 50px rgba(0,0,0,0.42),
    inset 0 0 24px rgba(136, 92, 246, 0.08);
  backdrop-filter: blur(18px);
}

.onix-nav button {
  color: #94A3B8;
}

.onix-nav button.onix-nav-active {
  background: linear-gradient(135deg, rgba(6,182,212,0.18), rgba(136,92,246,0.28)) !important;
  color: #B7F9FF !important;
  box-shadow:
    inset 0 0 18px rgba(136, 92, 246, 0.24),
    0 0 18px rgba(6, 182, 212, 0.12);
}

.onix-tap-orb {
  background:
    radial-gradient(circle at 50% 42%, rgba(0, 229, 255, 0.24), transparent 24%),
    radial-gradient(circle at 50% 55%, rgba(136, 92, 246, 0.34), transparent 48%),
    linear-gradient(145deg, rgba(17,24,39,0.72), rgba(8,15,23,0.98)) !important;
  border: 2px solid rgba(136, 92, 246, 0.72) !important;
  box-shadow:
    0 0 42px rgba(136, 92, 246, 0.72),
    0 0 78px rgba(6, 182, 212, 0.28),
    inset 0 0 38px rgba(136, 92, 246, 0.24) !important;
  position: relative;
  overflow: visible;
}

.onix-tap-orb::before {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 999px;
  border: 2px solid rgba(136, 92, 246, 0.62);
  box-shadow:
    0 0 18px rgba(136, 92, 246, 0.45),
    inset 0 0 24px rgba(6, 182, 212, 0.16);
  animation: onixOrbPulse 2.8s ease-in-out infinite;
}

.onix-tap-orb::after {
  content: '';
  position: absolute;
  inset: 20px;
  border-radius: 999px;
  border: 1px solid rgba(0, 229, 255, 0.34);
  box-shadow:
    inset 0 0 26px rgba(6, 182, 212, 0.14),
    0 0 18px rgba(0, 229, 255, 0.12);
  animation: onixOrbSpin 8s linear infinite;
}

.onix-tap-orb:active {
  transform: scale(0.94);
  box-shadow:
    0 0 62px rgba(6, 182, 212, 0.78),
    0 0 96px rgba(136, 92, 246, 0.62),
    inset 0 0 46px rgba(255, 255, 255, 0.16) !important;
}

.onix-crystal-shards {
  position: absolute;
  inset: -18px;
  pointer-events: none;
  border-radius: 999px;
  background:
    radial-gradient(circle at 18% 26%, rgba(168,85,247,0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 78% 18%, rgba(0,229,255,0.85) 0 2px, transparent 3px),
    radial-gradient(circle at 88% 70%, rgba(136,92,246,0.9) 0 2px, transparent 3px),
    radial-gradient(circle at 28% 84%, rgba(0,229,255,0.65) 0 1px, transparent 3px);
  filter: drop-shadow(0 0 8px rgba(136,92,246,0.85));
  opacity: 0.85;
  animation: onixShardTwinkle 2.4s ease-in-out infinite;
}

@keyframes onixOrbPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.035);
    opacity: 1;
  }
}

@keyframes onixOrbSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes onixCrystalFloat {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.025);
  }
}

@keyframes onixShardTwinkle {
  0%, 100% {
    opacity: 0.55;
    transform: rotate(0deg) scale(1);
  }
  50% {
    opacity: 1;
    transform: rotate(5deg) scale(1.02);
  }
}

.onix-floating-number {
  color: #00E5FF !important;
  text-shadow:
    0 0 10px rgba(6, 182, 212, 0.9),
    0 0 18px rgba(136, 92, 246, 0.65);
  font-weight: 900;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
}

.onix-card,
.bg-\\[\\#111827\\] {
  background: linear-gradient(145deg, rgba(17, 24, 39, 0.94), rgba(8, 15, 23, 0.98)) !important;
  border-color: rgba(136, 92, 246, 0.22) !important;
}

.bg-\\[\\#0a0f1c\\],
.bg-\\[\\#0A0F1C\\] {
  background: rgba(8, 15, 23, 0.72) !important;
}

.bg-yellow-400 {
  background: linear-gradient(135deg, #06B6D4 0%, #885CF6 46%, #A855F7 100%) !important;
  color: #ffffff !important;
  box-shadow:
    0 0 22px rgba(136, 92, 246, 0.38),
    inset 0 1px 0 rgba(255,255,255,0.25);
}

.text-yellow-400 {
  color: #B7F9FF !important;
}

.border-yellow-400\\/20,
.border-yellow-400\\/30,
.border-yellow-400 {
  border-color: rgba(136, 92, 246, 0.34) !important;
}

.bg-gray-800 {
  background: rgba(15, 23, 42, 0.92) !important;
}

.bg-emerald-500 {
  background: linear-gradient(135deg, #10B981, #06B6D4) !important;
}

.shadow-xl,
.shadow-2xl {
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.45),
    0 0 28px rgba(136, 92, 246, 0.10) !important;
}

.onix-progress-fill {
  background: linear-gradient(90deg, #06B6D4, #885CF6, #A855F7) !important;
  box-shadow: 0 0 18px rgba(136, 92, 246, 0.55);
}

.onix-gold-accent {
  color: #FACC15 !important;
  text-shadow: 0 0 16px rgba(250, 204, 21, 0.28);
}


.onix-tap-orb {
  width: min(76vw, 330px) !important;
  height: min(76vw, 330px) !important;
  margin-top: 8px;
}

.onix-tap-orb .onix-crystal-svg-tap {
  width: 76% !important;
  height: 76% !important;
}

.onix-brand-mark {
  flex-shrink: 0;
}

.onix-clean-home-note {
  letter-spacing: 0.18em;
  text-shadow:
    0 0 12px rgba(6, 182, 212, 0.55),
    0 0 22px rgba(136, 92, 246, 0.35);
}



.onix-brand-img {
  width: 46px;
  height: 46px;
  object-fit: contain;
  display: block;
  filter:
    drop-shadow(0 0 10px rgba(0, 229, 255, 0.65))
    drop-shadow(0 0 18px rgba(136, 92, 246, 0.70));
}

.onix-tap-img {
  width: 88%;
  height: 88%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 3;
  user-select: none;
  pointer-events: none;
  filter:
    drop-shadow(0 0 18px rgba(0, 229, 255, 0.82))
    drop-shadow(0 0 38px rgba(136, 92, 246, 0.78));
  animation: onixCrystalFloat 3.2s ease-in-out infinite;
}

.onix-tap-orb {
  background:
    radial-gradient(circle at 50% 45%, rgba(0, 229, 255, 0.22), transparent 26%),
    radial-gradient(circle at 50% 55%, rgba(136, 92, 246, 0.28), transparent 52%),
    rgba(8, 15, 23, 0.34) !important;
  border: 0 !important;
  box-shadow:
    0 0 46px rgba(136, 92, 246, 0.58),
    0 0 78px rgba(6, 182, 212, 0.24) !important;
}

.onix-tap-orb::before {
  inset: 4px !important;
  border: 2px solid rgba(136, 92, 246, 0.72) !important;
}

.onix-tap-orb::after {
  inset: 24px !important;
  border: 1px solid rgba(0, 229, 255, 0.38) !important;
}


/* onix-tap-coin-exact-style */

.onix-tap-img {
  width: 96%;
  height: 96%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 3;
  user-select: none;
  pointer-events: none;
  filter:
    drop-shadow(0 0 12px rgba(0, 229, 255, 0.72))
    drop-shadow(0 0 26px rgba(136, 92, 246, 0.68));
  animation: onixCrystalFloat 3.2s ease-in-out infinite;
}

.onix-tap-orb {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-tap-orb::before,
.onix-tap-orb::after {
  display: none !important;
}

.onix-crystal-shards {
  display: none !important;
}



/* Step 1B: mobile shell + real fixed Telegram bottom navigation */
html,
body,
#root {
  min-height: 100%;
  background: #050914;
}

.onix-app-bg {
  max-width: 430px;
  width: 100%;
  min-height: 100dvh;
  margin-left: auto;
  margin-right: auto;
  padding-bottom: calc(112px + env(safe-area-inset-bottom)) !important;
  box-shadow: 0 0 0 1px rgba(136, 92, 246, 0.22), 0 0 80px rgba(91, 33, 246, 0.28);
}

.onix-nav {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  bottom: calc(10px + env(safe-area-inset-bottom)) !important;
  top: auto !important;
  transform: translateX(-50%);
  z-index: 999 !important;
  width: min(calc(100vw - 20px), 410px) !important;
  max-width: 410px !important;
  margin: 0 !important;
  padding: 6px !important;
  border-radius: 22px !important;
  overflow-x: auto;
  scrollbar-width: none;
}

.onix-nav::-webkit-scrollbar {
  display: none;
}

.onix-nav button {
  min-width: 62px !important;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
  border-radius: 17px !important;
}

.onix-nav button svg {
  filter: drop-shadow(0 0 8px rgba(168, 85, 247, 0.55));
}

@media (min-width: 520px) {
  body {
    display: flex;
    justify-content: center;
  }
}

.onix-header {
  border-bottom-color: rgba(136, 92, 246, 0.16) !important;
}


/* Step 2: ONIX home screen polish */
.onix-header {
  margin: 10px 12px 0;
  border: 1px solid rgba(136, 92, 246, 0.18);
  border-radius: 26px;
  position: sticky;
  top: 8px;
}

.onix-header .onix-brand-title {
  font-size: 1.35rem !important;
  line-height: 1;
}

.onix-energy-pill {
  min-height: 38px;
  padding-left: 14px !important;
  padding-right: 14px !important;
  color: #e0fbff;
}

.onix-rank-panel {
  margin: 14px 14px 0;
  padding: 14px !important;
  border: 1px solid rgba(136, 92, 246, 0.22);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 18%, rgba(136, 92, 246, 0.22), transparent 36%),
    linear-gradient(135deg, rgba(17, 24, 39, 0.78), rgba(8, 15, 23, 0.92));
  box-shadow:
    0 16px 44px rgba(0,0,0,0.30),
    inset 0 0 24px rgba(136, 92, 246, 0.06);
}

.onix-rank-panel > .flex {
  margin-bottom: 10px !important;
}

.onix-rank-panel .text-sm {
  font-size: 11px !important;
}

.onix-balance-panel {
  margin: 12px 14px 0;
  padding: 18px 14px 16px !important;
  border: 1px solid rgba(136, 92, 246, 0.26);
  border-radius: 28px;
  background:
    radial-gradient(circle at 82% 18%, rgba(168, 85, 247, 0.24), transparent 36%),
    radial-gradient(circle at 16% 68%, rgba(6, 182, 212, 0.14), transparent 42%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.72), rgba(8, 15, 23, 0.94));
  box-shadow:
    0 18px 56px rgba(0,0,0,0.36),
    0 0 36px rgba(136, 92, 246, 0.10),
    inset 0 1px 0 rgba(255,255,255,0.05);
}

.onix-balance-panel > p:first-child {
  color: #98f7ff !important;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 11px !important;
}

.onix-balance-number {
  margin-top: 4px;
  font-size: clamp(2.8rem, 14vw, 4rem) !important;
  line-height: 0.95;
}

.onix-home-screen {
  margin-top: 20px !important;
  padding-left: 14px;
  padding-right: 14px;
}

.onix-home-screen .onix-tap-orb {
  width: min(78vw, 315px) !important;
  height: min(78vw, 315px) !important;
}

.onix-clean-home-note {
  margin-top: 18px !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid rgba(6, 182, 212, 0.24);
  background: rgba(8, 15, 23, 0.66);
  box-shadow: 0 0 22px rgba(6, 182, 212, 0.12), inset 0 0 18px rgba(136, 92, 246, 0.08);
}

.onix-launch-card {
  margin-top: 4px;
  border-color: rgba(136, 92, 246, 0.28) !important;
  background:
    linear-gradient(145deg, rgba(17,24,39,0.82), rgba(8,15,23,0.96)) !important;
  box-shadow:
    0 20px 54px rgba(0,0,0,0.38),
    0 0 32px rgba(136, 92, 246, 0.10) !important;
}

.onix-launch-card button {
  border: 1px solid rgba(136, 92, 246, 0.16);
}

@media (max-width: 380px) {
  .onix-header {
    margin-left: 8px;
    margin-right: 8px;
    padding: 12px !important;
  }

  .onix-brand-mark {
    width: 48px;
    height: 48px;
  }

  .onix-header .onix-brand-title {
    font-size: 1.1rem !important;
  }

  .onix-energy-pill {
    padding-left: 10px !important;
    padding-right: 10px !important;
    font-size: 13px;
  }
}

/* Step 3: upgrades / boosts screen polish */
.onix-boosts-screen {
  margin-top: 16px !important;
  padding-left: 14px !important;
  padding-right: 14px !important;
  padding-bottom: 24px;
}

.onix-boosts-screen > .rounded-3xl,
.onix-boosts-screen .space-y-4 > .rounded-3xl,
.onix-boosts-screen .mb-5.rounded-3xl,
.onix-boosts-screen .mb-4.rounded-3xl {
  border-color: rgba(136, 92, 246, 0.26) !important;
  background:
    radial-gradient(circle at 12% 16%, rgba(136, 92, 246, 0.22), transparent 34%),
    radial-gradient(circle at 88% 20%, rgba(6, 182, 212, 0.10), transparent 36%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.82), rgba(8, 15, 23, 0.96)) !important;
  box-shadow:
    0 18px 52px rgba(0,0,0,0.38),
    0 0 28px rgba(136, 92, 246, 0.09),
    inset 0 1px 0 rgba(255,255,255,0.04) !important;
}

.onix-boosts-screen h2 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.28);
}

.onix-boosts-screen h3 {
  letter-spacing: -0.01em;
}

.onix-boosts-screen .grid.grid-cols-2 > .rounded-2xl,
.onix-boosts-screen .rounded-2xl.bg-\[\#0a0f1c\] {
  border: 1px solid rgba(136, 92, 246, 0.16);
  background: rgba(8, 15, 23, 0.74) !important;
  box-shadow: inset 0 0 18px rgba(136, 92, 246, 0.05);
}

.onix-boost-tabs {
  top: 10px !important;
  border: 1px solid rgba(136, 92, 246, 0.28);
  background: rgba(8, 15, 23, 0.82) !important;
  backdrop-filter: blur(18px);
  box-shadow:
    0 14px 36px rgba(0,0,0,0.32),
    inset 0 0 20px rgba(136, 92, 246, 0.08) !important;
}

.onix-boost-tabs button {
  border-radius: 14px !important;
  letter-spacing: 0.04em;
}

.onix-boosts-screen button.bg-yellow-400,
.onix-boost-tabs button.bg-yellow-400 {
  background: linear-gradient(135deg, #06B6D4 0%, #885CF6 48%, #A855F7 100%) !important;
  color: #ffffff !important;
  box-shadow:
    0 0 22px rgba(136, 92, 246, 0.34),
    inset 0 1px 0 rgba(255,255,255,0.22) !important;
}

.onix-boosts-screen button:disabled {
  border: 1px solid rgba(148, 163, 184, 0.10);
  background: rgba(31, 41, 55, 0.78) !important;
}

.onix-boosts-screen .h-3.overflow-hidden.rounded-full {
  height: 8px !important;
  background: rgba(15, 23, 42, 0.92) !important;
  border: 1px solid rgba(136, 92, 246, 0.12);
}

.onix-boosts-screen .h-full.rounded-full.bg-yellow-400 {
  background: linear-gradient(90deg, #06B6D4, #885CF6, #A855F7) !important;
  box-shadow: 0 0 16px rgba(136, 92, 246, 0.52);
}

@media (max-width: 380px) {
  .onix-boosts-screen {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  .onix-boosts-screen > .rounded-3xl,
  .onix-boosts-screen .space-y-4 > .rounded-3xl {
    padding: 16px !important;
  }

  .onix-boosts-screen h2 {
    font-size: 1.25rem !important;
  }
}

/* Step 4: wallet screen polish */
.onix-wallet-screen {
  margin-top: 16px !important;
  padding-left: 14px !important;
  padding-right: 14px !important;
  padding-bottom: 24px;
}

.onix-wallet-screen > .rounded-3xl,
.onix-wallet-screen .rounded-3xl.border,
.onix-wallet-screen .rounded-2xl {
  border-color: rgba(136, 92, 246, 0.24) !important;
}

.onix-wallet-screen > .rounded-3xl {
  background:
    radial-gradient(circle at 80% 0%, rgba(136, 92, 246, 0.26), transparent 34%),
    radial-gradient(circle at 8% 18%, rgba(6, 182, 212, 0.14), transparent 30%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.84), rgba(8, 15, 23, 0.96)) !important;
  box-shadow:
    0 18px 54px rgba(0,0,0,0.42),
    0 0 34px rgba(136, 92, 246, 0.10),
    inset 0 1px 0 rgba(255,255,255,0.05) !important;
}

.onix-wallet-screen h2 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.30);
}

.onix-wallet-screen .rounded-3xl.bg-\[\#0a0f1c\] {
  border: 1px solid rgba(6, 182, 212, 0.20);
  background:
    radial-gradient(circle at 72% 20%, rgba(250, 204, 21, 0.10), transparent 26%),
    radial-gradient(circle at 30% 0%, rgba(136, 92, 246, 0.20), transparent 36%),
    rgba(8, 15, 23, 0.86) !important;
  box-shadow:
    0 0 30px rgba(6, 182, 212, 0.08),
    inset 0 0 28px rgba(136, 92, 246, 0.08);
}

.onix-wallet-screen .rounded-2xl.bg-\[\#0a0f1c\] {
  background: rgba(8, 15, 23, 0.76) !important;
  box-shadow: inset 0 0 18px rgba(136, 92, 246, 0.05);
}

.onix-wallet-screen .text-yellow-400 {
  color: #FACC15 !important;
  text-shadow: 0 0 16px rgba(250, 204, 21, 0.12);
}

.onix-wallet-screen .text-5xl.font-bold.text-yellow-400 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  background: linear-gradient(90deg, #FFFFFF, #B7F9FF 38%, #A855F7 76%, #FACC15);
  -webkit-background-clip: text;
  color: transparent !important;
  text-shadow: none;
}

.onix-wallet-screen input,
.onix-wallet-screen textarea,
.onix-wallet-screen select {
  border-color: rgba(136, 92, 246, 0.22) !important;
  background: rgba(8, 15, 23, 0.78) !important;
  box-shadow: inset 0 0 18px rgba(136, 92, 246, 0.06);
}

.onix-wallet-screen button.bg-yellow-400,
.onix-wallet-screen button.bg-emerald-500,
.onix-wallet-screen button.bg-sky-500 {
  background: linear-gradient(135deg, #06B6D4 0%, #885CF6 48%, #A855F7 100%) !important;
  color: #ffffff !important;
  box-shadow:
    0 0 22px rgba(136, 92, 246, 0.34),
    inset 0 1px 0 rgba(255,255,255,0.22) !important;
}

.onix-wallet-screen button:disabled {
  border: 1px solid rgba(148, 163, 184, 0.10);
  background: rgba(31, 41, 55, 0.78) !important;
}

.onix-wallet-screen .h-3.overflow-hidden.rounded-full,
.onix-wallet-screen .h-2.overflow-hidden.rounded-full {
  background: rgba(15, 23, 42, 0.92) !important;
  border: 1px solid rgba(136, 92, 246, 0.12);
}

.onix-wallet-screen .h-full.rounded-full.bg-yellow-400,
.onix-wallet-screen .h-full.rounded-full.bg-emerald-400 {
  background: linear-gradient(90deg, #06B6D4, #885CF6, #A855F7) !important;
  box-shadow: 0 0 16px rgba(136, 92, 246, 0.52);
}

.onix-wallet-screen .space-y-3 > .rounded-2xl,
.onix-wallet-screen .space-y-4 > .rounded-2xl {
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.onix-wallet-screen .space-y-3 > .rounded-2xl:active,
.onix-wallet-screen .space-y-4 > .rounded-2xl:active {
  transform: scale(0.99);
}

@media (max-width: 380px) {
  .onix-wallet-screen {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  .onix-wallet-screen > .rounded-3xl {
    padding: 16px !important;
  }

  .onix-wallet-screen .text-5xl.font-bold.text-yellow-400 {
    font-size: 2.35rem !important;
  }
}


/* Step 5: ONIX profile screen polish */
.onix-profile-screen {
  padding-top: 6px;
  padding-bottom: 18px;
}

.onix-profile-screen > div:first-child {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.24), transparent 34%),
    radial-gradient(circle at 12% 18%, rgba(6, 182, 212, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(8, 15, 23, 0.96)) !important;
  border-color: rgba(168, 85, 247, 0.34) !important;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.45),
    0 0 42px rgba(136, 92, 246, 0.18),
    inset 0 0 34px rgba(6, 182, 212, 0.06) !important;
}

.onix-profile-screen > div:first-child::before {
  content: '';
  position: absolute;
  inset: -80px -70px auto auto;
  width: 190px;
  height: 190px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(0, 229, 255, 0.18), transparent 68%);
  pointer-events: none;
}

.onix-profile-screen > div:first-child::after {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.55), rgba(168, 85, 247, 0.5), transparent);
  pointer-events: none;
}

.onix-profile-screen > div:first-child > div:first-child {
  position: relative;
  background:
    radial-gradient(circle at 50% 45%, rgba(250, 204, 21, 0.95), rgba(168, 85, 247, 0.4) 58%, rgba(6, 182, 212, 0.14) 100%) !important;
  color: #080F17 !important;
  border: 1px solid rgba(250, 204, 21, 0.5);
  box-shadow:
    0 0 28px rgba(250, 204, 21, 0.25),
    0 0 38px rgba(168, 85, 247, 0.28),
    inset 0 0 22px rgba(255, 255, 255, 0.22);
}

.onix-profile-screen h2 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 0 22px rgba(168, 85, 247, 0.45);
}

.onix-profile-screen .rounded-2xl,
.onix-profile-screen .rounded-3xl {
  border: 1px solid rgba(136, 92, 246, 0.18);
  box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.025);
}

.onix-profile-screen .rounded-2xl {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.74), rgba(8, 15, 23, 0.92)) !important;
}

.onix-profile-screen .grid > div {
  background:
    linear-gradient(180deg, rgba(17, 24, 39, 0.8), rgba(8, 15, 23, 0.92)) !important;
  border: 1px solid rgba(6, 182, 212, 0.12);
}

.onix-profile-screen .h-3 {
  height: 10px !important;
  background: rgba(15, 23, 42, 0.95) !important;
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.onix-profile-screen .h-3 > div {
  background: linear-gradient(90deg, #885CF6, #00E5FF, #FACC15) !important;
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.35);
}

.onix-profile-screen button:not(:disabled) {
  box-shadow: 0 0 18px rgba(136, 92, 246, 0.12);
}

.onix-profile-screen input {
  border: 1px solid rgba(136, 92, 246, 0.22);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.18);
}


/* Step 6: reference-style home / tap screen */
.onix-home-screen {
  margin-top: 14px !important;
  gap: 0;
}

.onix-home-hero-card {
  width: 100%;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(136, 92, 246, 0.34);
  border-radius: 26px;
  padding: 16px;
  background:
    radial-gradient(circle at 88% 12%, rgba(168, 85, 247, 0.34), transparent 34%),
    radial-gradient(circle at 15% 25%, rgba(6, 182, 212, 0.14), transparent 32%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.88), rgba(8, 15, 23, 0.98));
  box-shadow:
    0 24px 68px rgba(0, 0, 0, 0.42),
    0 0 38px rgba(136, 92, 246, 0.16),
    inset 0 0 32px rgba(136, 92, 246, 0.07);
}

.onix-home-hero-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(110deg, transparent 0 32%, rgba(255, 255, 255, 0.055) 46%, transparent 60% 100%),
    radial-gradient(circle at 72% 48%, rgba(0, 229, 255, 0.12), transparent 34%);
  pointer-events: none;
}

.onix-home-user-row,
.onix-home-balance-row,
.onix-home-level-row {
  position: relative;
  z-index: 2;
}

.onix-home-avatar {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.22), transparent 60%),
    linear-gradient(145deg, rgba(15, 23, 42, 0.94), rgba(8, 15, 23, 0.98));
  border: 1px solid rgba(168, 85, 247, 0.55);
  box-shadow:
    0 0 24px rgba(136, 92, 246, 0.44),
    inset 0 0 18px rgba(6, 182, 212, 0.08);
}

.onix-home-avatar img,
.onix-home-rank-mark img {
  width: 76%;
  height: 76%;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.65));
}

.onix-home-rank-mark {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 50%, rgba(168, 85, 247, 0.24), transparent 62%),
    rgba(8, 15, 23, 0.74);
  border: 1px solid rgba(136, 92, 246, 0.38);
  box-shadow: 0 0 24px rgba(136, 92, 246, 0.28);
}

.onix-home-username {
  font-size: 15px;
  font-weight: 900;
  color: #ffffff;
  line-height: 1.1;
}

.onix-home-title {
  margin-top: 3px;
  font-size: 11px;
  color: #A855F7;
  font-weight: 700;
}

.onix-home-balance-label {
  margin-top: 16px;
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #94A3B8;
}

.onix-home-balance-value {
  margin-top: 4px;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  font-size: clamp(2rem, 10vw, 3.05rem);
  line-height: 1;
  text-align: center;
  font-weight: 900;
  letter-spacing: -0.06em;
  background: linear-gradient(90deg, #FFFFFF, #B7F9FF 34%, #A855F7 78%, #FACC15 100%);
  -webkit-background-clip: text;
  color: transparent;
  text-shadow: 0 0 34px rgba(136, 92, 246, 0.20);
}

.onix-home-balance-symbol {
  margin-top: 2px;
  text-align: center;
  font-size: 13px;
  font-weight: 900;
  color: #FACC15;
  letter-spacing: 0.08em;
}

.onix-home-level-row {
  margin-top: 14px;
}

.onix-home-level-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
  color: #CBD5E1;
  font-weight: 700;
}

.onix-home-level-track {
  margin-top: 8px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(136, 92, 246, 0.12);
}

.onix-home-level-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #885CF6, #A855F7, #06B6D4);
  box-shadow: 0 0 18px rgba(136, 92, 246, 0.55);
}

.onix-home-screen .onix-tap-orb {
  margin-top: 26px !important;
  width: min(72vw, 300px) !important;
  height: min(72vw, 300px) !important;
}

.onix-home-energy-block {
  width: 100%;
  margin-top: 8px;
  padding: 0 8px;
}

.onix-home-energy-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 900;
  color: #DDEBFF;
}

.onix-home-energy-text strong {
  color: #FACC15;
}

.onix-home-energy-track {
  margin-top: 8px;
  height: 9px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(6, 182, 212, 0.18);
  box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.26);
}

.onix-home-energy-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #06B6D4, #00E5FF, #885CF6);
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.45);
}

.onix-home-tap-button {
  width: 100%;
  min-height: 52px;
  margin-top: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, #5B21F6 0%, #885CF6 48%, #A855F7 100%);
  color: #ffffff;
  font-weight: 900;
  letter-spacing: 0.06em;
  box-shadow:
    0 0 28px rgba(136, 92, 246, 0.44),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
  transition: transform 150ms ease, filter 150ms ease;
}

.onix-home-tap-button:active {
  transform: scale(0.98);
  filter: brightness(1.12);
}

.onix-home-screen .onix-clean-home-note {
  display: none !important;
}

.onix-home-screen .onix-launch-card {
  display: none !important;
}

/* Step 19: Telegram home screen refinement */
.onix-header {
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}

.onix-brand-mark {
  width: 84px;
  height: 84px;
}

.onix-brand-img {
  width: 58px;
  height: 58px;
}

.onix-brand-title {
  font-size: clamp(1.95rem, 7vw, 2.5rem) !important;
  line-height: 0.88;
  letter-spacing: 0.03em;
}

.onix-home-screen {
  margin-top: 14px !important;
}

.onix-home-hero-card {
  padding: 16px 16px 14px;
  border-radius: 28px;
}

.onix-home-user-row {
  align-items: flex-start;
  justify-content: flex-start;
}

.onix-home-name-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.onix-home-inline-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(136, 92, 246, 0.34);
  background: rgba(91, 33, 246, 0.18);
  color: #DAD7FF;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.onix-home-title,
.onix-home-rank-mark,
.onix-home-level-row {
  display: none !important;
}

.onix-home-mini-rank-row {
  margin-top: 8px;
}

.onix-home-mini-rank-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 9px;
  font-weight: 700;
  color: #B9C2D3;
}

.onix-home-mini-rank-name {
  color: #F5F8FF;
  font-weight: 800;
}

.onix-home-mini-rank-meta {
  color: #94A3B8;
  text-align: right;
}

.onix-home-mini-track {
  margin-top: 5px;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(136, 92, 246, 0.14);
}

.onix-home-mini-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #885CF6, #A855F7, #06B6D4);
  box-shadow: 0 0 12px rgba(136, 92, 246, 0.45);
}

.onix-home-balance-label {
  margin-top: 14px;
}

.onix-home-balance-value {
  margin-top: 6px;
  font-size: clamp(2.45rem, 12vw, 4rem);
  letter-spacing: -0.08em;
}

.onix-home-balance-symbol {
  margin-top: 8px;
  text-align: center;
  font-size: 15px;
  letter-spacing: 0.08em;
}

.onix-home-screen .onix-tap-orb {
  margin-top: 18px !important;
  width: min(66vw, 274px) !important;
  height: min(66vw, 274px) !important;
}

.onix-home-energy-block {
  margin-top: 2px;
  padding: 0 4px 14px;
}

.onix-home-energy-text {
  margin-top: 2px;
}

.onix-home-energy-track {
  margin-top: 6px;
}

.onix-home-tap-button {
  margin-top: 10px;
  min-height: 50px;
}

@media (max-width: 380px) {
  .onix-home-hero-card {
    padding: 14px;
    border-radius: 24px;
  }

  .onix-home-avatar {
    width: 48px;
    height: 48px;
  }

  .onix-home-rank-mark {
    width: 44px;
    height: 44px;
  }

  .onix-home-screen .onix-tap-orb {
    width: min(70vw, 270px) !important;
    height: min(70vw, 270px) !important;
  }
}


/* Step 8: team / friends screen polish */
.onix-social-screen {
  padding-top: 6px;
  padding-bottom: 22px;
}

.onix-social-screen > .rounded-3xl {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 0%, rgba(6, 182, 212, 0.12), transparent 32%),
    radial-gradient(circle at 86% 8%, rgba(168, 85, 247, 0.20), transparent 34%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.90), rgba(8, 15, 23, 0.96)) !important;
  border-color: rgba(136, 92, 246, 0.26) !important;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.42),
    0 0 34px rgba(136, 92, 246, 0.14),
    inset 0 0 32px rgba(6, 182, 212, 0.04) !important;
}

.onix-social-screen > .rounded-3xl::before {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.48), rgba(168, 85, 247, 0.48), transparent);
  pointer-events: none;
}

.onix-social-screen h2,
.onix-social-screen h3,
.onix-social-screen h4 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.32);
}

.onix-social-screen .rounded-2xl,
.onix-social-screen .rounded-3xl {
  border: 1px solid rgba(136, 92, 246, 0.18);
}

.onix-social-screen .rounded-2xl.bg-\[\#0a0f1c\],
.onix-social-screen .rounded-2xl.bg-\[\#111827\] {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(8, 15, 23, 0.94)) !important;
  box-shadow: inset 0 0 22px rgba(255, 255, 255, 0.025);
}

.onix-social-screen .grid.grid-cols-3 > div,
.onix-social-screen .grid.grid-cols-2 > div {
  background:
    radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.12), transparent 55%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.82), rgba(8, 15, 23, 0.94)) !important;
  border: 1px solid rgba(6, 182, 212, 0.12);
}

.onix-social-screen .h-3,
.onix-social-screen .h-2 {
  background: rgba(15, 23, 42, 0.94) !important;
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.onix-social-screen .h-3 > div,
.onix-social-screen .h-2 > div {
  background: linear-gradient(90deg, #885CF6, #00E5FF, #FACC15) !important;
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.32);
}

.onix-social-screen input {
  background: rgba(8, 15, 23, 0.82) !important;
  border: 1px solid rgba(136, 92, 246, 0.28);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.22);
}

.onix-social-screen button.bg-yellow-400,
.onix-social-screen button.bg-emerald-500,
.onix-social-screen button.bg-sky-500 {
  background: linear-gradient(135deg, #5B21F6, #885CF6, #A855F7) !important;
  color: #ffffff !important;
  box-shadow: 0 0 22px rgba(136, 92, 246, 0.30);
}

.onix-social-screen .text-yellow-400 {
  color: #FACC15 !important;
  text-shadow: 0 0 14px rgba(250, 204, 21, 0.18);
}

.onix-social-screen .text-emerald-400 {
  color: #22C55E !important;
  text-shadow: 0 0 14px rgba(34, 197, 94, 0.14);
}

@media (max-width: 380px) {
  .onix-social-screen {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }

  .onix-social-screen > .rounded-3xl {
    padding: 16px !important;
  }
}


/* Step 9: launch / roadmap screen polish */
.onix-launch-screen {
  padding-top: 6px;
  padding-bottom: 24px;
}

.onix-launch-screen > .rounded-3xl {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 78% 8%, rgba(168, 85, 247, 0.22), transparent 32%),
    radial-gradient(circle at 8% 12%, rgba(6, 182, 212, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.86), rgba(8, 15, 23, 0.96)) !important;
  border-color: rgba(136, 92, 246, 0.3) !important;
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.45),
    0 0 42px rgba(136, 92, 246, 0.14),
    inset 0 0 34px rgba(255, 255, 255, 0.025) !important;
}

.onix-launch-screen > .rounded-3xl::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.12), transparent),
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.1), transparent 34%);
  opacity: 0.7;
}

.onix-launch-screen > .rounded-3xl > * {
  position: relative;
  z-index: 1;
}

.onix-launch-screen h2,
.onix-launch-screen h3 {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  letter-spacing: 0.02em;
  text-shadow: 0 0 20px rgba(168, 85, 247, 0.38);
}

.onix-launch-screen > .rounded-3xl:first-child {
  min-height: 235px;
  background:
    radial-gradient(circle at 86% 20%, rgba(250, 204, 21, 0.14), transparent 24%),
    radial-gradient(circle at 18% 4%, rgba(168, 85, 247, 0.28), transparent 34%),
    linear-gradient(145deg, rgba(17, 24, 39, 0.92), rgba(8, 15, 23, 0.98)) !important;
}

.onix-launch-screen > .rounded-3xl:first-child .h-14,
.onix-launch-screen > .rounded-3xl:last-child .h-16 {
  background:
    radial-gradient(circle, rgba(250, 204, 21, 0.9), rgba(168, 85, 247, 0.55) 62%, rgba(6, 182, 212, 0.14)) !important;
  color: #080F17 !important;
  box-shadow:
    0 0 28px rgba(250, 204, 21, 0.22),
    0 0 36px rgba(168, 85, 247, 0.28),
    inset 0 0 18px rgba(255, 255, 255, 0.18);
}

.onix-launch-screen .grid .rounded-2xl,
.onix-launch-screen .space-y-3 > .rounded-2xl,
.onix-launch-screen .space-y-3 > .flex {
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.78), rgba(8, 15, 23, 0.94)) !important;
  border: 1px solid rgba(6, 182, 212, 0.12);
  box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.025);
}

.onix-launch-screen .space-y-3 > .rounded-2xl:hover,
.onix-launch-screen .space-y-3 > .flex:hover {
  border-color: rgba(168, 85, 247, 0.28);
  box-shadow:
    inset 0 0 24px rgba(255, 255, 255, 0.035),
    0 0 24px rgba(136, 92, 246, 0.12);
}

.onix-launch-screen button.bg-yellow-400 {
  background: linear-gradient(135deg, #7c3aed, #a855f7 55%, #06b6d4) !important;
  color: #fff !important;
  border: 1px solid rgba(216, 180, 254, 0.55);
  box-shadow:
    0 0 22px rgba(168, 85, 247, 0.42),
    inset 0 0 16px rgba(255, 255, 255, 0.12);
}

.onix-launch-screen > .rounded-3xl:last-child {
  background:
    radial-gradient(circle at 50% 0%, rgba(250, 204, 21, 0.16), transparent 34%),
    radial-gradient(circle at 82% 24%, rgba(6, 182, 212, 0.14), transparent 28%),
    linear-gradient(180deg, rgba(88, 28, 135, 0.32), rgba(8, 15, 23, 0.96)) !important;
}


/* Step 10: global visual refinement toward reference */
.onix-app-bg {
  isolation: isolate;
  overflow-y: auto;
  background:
    radial-gradient(circle at 50% -4%, rgba(168, 85, 247, 0.24), transparent 28%),
    radial-gradient(circle at 100% 16%, rgba(6, 182, 212, 0.14), transparent 28%),
    radial-gradient(circle at 0% 72%, rgba(91, 33, 246, 0.18), transparent 34%),
    linear-gradient(180deg, #070b14 0%, #090f1d 44%, #050812 100%) !important;
}

.onix-app-bg::after {
  content: '';
  position: fixed;
  inset: 0;
  max-width: 430px;
  margin: 0 auto;
  pointer-events: none;
  z-index: 0;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    radial-gradient(circle at 50% 22%, rgba(168,85,247,0.12), transparent 36%);
  background-size: 42px 42px, 42px 42px, auto;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.06) 72%, transparent);
}

.onix-app-bg > * {
  position: relative;
  z-index: 1;
}

.onix-header {
  background:
    linear-gradient(135deg, rgba(17, 24, 39, 0.82), rgba(8, 15, 23, 0.94)) !important;
  box-shadow:
    0 14px 42px rgba(0,0,0,0.42),
    0 0 26px rgba(136, 92, 246, 0.10),
    inset 0 1px 0 rgba(255,255,255,0.06) !important;
}

.onix-brand-mark {
  width: 48px !important;
  height: 48px !important;
  border-radius: 17px !important;
}

.onix-brand-img {
  width: 42px !important;
  height: 42px !important;
}

.onix-card,
.onix-rank-panel,
.onix-balance-panel,
.onix-launch-card,
.onix-boosts-screen > .rounded-3xl,
.onix-wallet-screen > .rounded-3xl,
.onix-profile-screen > div:first-child,
.onix-tasks-screen > .rounded-3xl,
.onix-social-screen > .rounded-3xl,
.onix-launch-screen > .rounded-3xl {
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.rounded-3xl,
.rounded-2xl {
  border-color: rgba(136, 92, 246, 0.22) !important;
}

.onix-app-bg button {
  transition: transform 130ms ease, filter 130ms ease, box-shadow 130ms ease, border-color 130ms ease;
}

.onix-app-bg button:active {
  transform: scale(0.975);
  filter: brightness(1.12);
}

.onix-app-bg button:disabled {
  transform: none !important;
  filter: none !important;
}

.onix-balance-number,
.onix-wallet-screen .text-5xl.font-bold.text-yellow-400 {
  letter-spacing: -0.055em;
}

.onix-home-screen {
  min-height: calc(100dvh - 248px);
}

.onix-home-screen .onix-tap-orb {
  margin-left: auto;
  margin-right: auto;
  filter: drop-shadow(0 28px 42px rgba(0, 0, 0, 0.48));
}

.onix-tap-img {
  transform-origin: center;
}

.onix-tap-orb:active .onix-tap-img {
  transform: scale(0.965) rotate(-1deg);
}

.onix-nav {
  background:
    linear-gradient(135deg, rgba(12, 18, 32, 0.86), rgba(6, 10, 20, 0.94)) !important;
  border-color: rgba(168, 85, 247, 0.34) !important;
  box-shadow:
    0 18px 54px rgba(0,0,0,0.58),
    0 0 34px rgba(136, 92, 246, 0.18),
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 0 24px rgba(6, 182, 212, 0.045) !important;
}

.onix-nav button {
  min-width: 58px !important;
  color: rgba(203, 213, 225, 0.78) !important;
}

.onix-nav button.onix-nav-active {
  color: #ffffff !important;
  border: 1px solid rgba(183, 249, 255, 0.22);
  background:
    radial-gradient(circle at 50% 0%, rgba(183, 249, 255, 0.16), transparent 62%),
    linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(136, 92, 246, 0.34)) !important;
}

.onix-nav button span {
  font-size: 10px !important;
  letter-spacing: 0.01em;
}

.onix-boosts-screen,
.onix-wallet-screen,
.onix-profile-screen,
.onix-tasks-screen,
.onix-social-screen,
.onix-launch-screen {
  padding-left: 12px !important;
  padding-right: 12px !important;
}

.onix-boosts-screen h2,
.onix-wallet-screen h2,
.onix-profile-screen h2,
.onix-tasks-screen h2,
.onix-social-screen h2,
.onix-launch-screen h2 {
  letter-spacing: 0.015em;
}

.onix-boosts-screen .space-y-4 > .rounded-3xl,
.onix-wallet-screen .space-y-3 > .rounded-2xl,
.onix-wallet-screen .space-y-4 > .rounded-2xl,
.onix-tasks-screen .space-y-3 > .rounded-2xl,
.onix-social-screen .space-y-3 > .rounded-2xl,
.onix-launch-screen .space-y-3 > .rounded-2xl {
  position: relative;
  overflow: hidden;
}

.onix-boosts-screen .space-y-4 > .rounded-3xl::after,
.onix-wallet-screen .space-y-3 > .rounded-2xl::after,
.onix-wallet-screen .space-y-4 > .rounded-2xl::after,
.onix-tasks-screen .space-y-3 > .rounded-2xl::after,
.onix-social-screen .space-y-3 > .rounded-2xl::after,
.onix-launch-screen .space-y-3 > .rounded-2xl::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.045) 42%, transparent 70%);
  opacity: 0.45;
}


.onix-header {
  margin-top: -8px;
  padding-top: 14px !important;
  padding-bottom: 8px !important;
}

.onix-brand-mark {
  width: 76px;
  height: 76px;
  border-radius: 22px;
}

.onix-brand-img {
  width: 54px;
  height: 54px;
}

.onix-brand-title {
  font-size: clamp(2.15rem, 8vw, 2.8rem) !important;
  line-height: 0.84;
  letter-spacing: 0.035em;
}

.onix-home-screen {
  margin-top: 10px !important;
}

.onix-home-hero-card {
  padding: 14px 14px 12px;
  border-radius: 26px;
}

.onix-home-user-row {
  gap: 12px;
}

.onix-home-avatar {
  width: 50px;
  height: 50px;
}

.onix-home-name-badge-row {
  gap: 7px;
}

.onix-home-inline-badge {
  padding: 3px 10px;
  font-size: 10px;
}

.onix-home-rank-simple-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.onix-home-rank-inline-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(0, 229, 255, 0.55));
}

.onix-home-rank-simple-text {
  font-size: 11px;
  font-weight: 800;
  color: #DDEAFE;
  letter-spacing: 0.02em;
}

.onix-home-mini-rank-row,
.onix-home-level-row,
.onix-home-balance-symbol {
  display: none !important;
}

.onix-home-balance-row {
  margin-top: 8px;
}

.onix-home-balance-pill-wrap {
  display: flex;
  justify-content: center;
}

.onix-home-balance-label,
.onix-home-balance-label-pill {
  margin: 0;
}

.onix-home-balance-label-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(250, 204, 21, 0.32);
  background: rgba(250, 204, 21, 0.08);
  color: #FACC15;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: inset 0 0 14px rgba(250, 204, 21, 0.08), 0 0 20px rgba(250, 204, 21, 0.08);
}

.onix-home-balance-value {
  margin-top: 10px;
  font-size: clamp(2.2rem, 11vw, 3.55rem);
  letter-spacing: -0.09em;
}

.onix-home-screen .onix-tap-orb {
  margin-top: 12px !important;
  width: min(63vw, 258px) !important;
  height: min(63vw, 258px) !important;
}

.onix-home-energy-block {
  margin-top: -2px;
  padding: 0 2px 12px;
}

.onix-home-energy-text {
  font-size: 11px;
}

.onix-home-energy-track {
  margin-top: 5px;
  height: 8px;
}

.onix-home-tap-button {
  margin-top: 8px;
  min-height: 48px;
}

@media (max-width: 380px) {
  .onix-nav {
    width: min(calc(100vw - 14px), 410px) !important;
    bottom: calc(4px + env(safe-area-inset-bottom)) !important;
    padding: 5px !important;
  }

  .onix-nav button {
    min-width: 54px !important;
    padding-left: 7px !important;
    padding-right: 7px !important;
  }

  .onix-nav button span {
    font-size: 9px !important;
  }

  .onix-app-bg {
    padding-bottom: calc(104px + env(safe-area-inset-bottom)) !important;
  }
}


/* Step 24: clean flush island header + locked home screen */
.onix-home-locked {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}

.onix-home-locked .onix-app-bg {
  overflow: hidden;
}

.onix-header {
  top: 0 !important;
  margin-top: 0 !important;
  padding: 0 !important;
  min-height: 58px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: transparent !important;
  border-bottom: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

.onix-island-header {
  position: relative;
  width: min(76vw, 292px);
  min-height: 62px;
  padding: 12px 18px 11px;
  border-radius: 0 0 26px 26px;
  background:
    radial-gradient(circle at 22% 6%, rgba(6, 182, 212, 0.18), transparent 34%),
    radial-gradient(circle at 78% 0%, rgba(168, 85, 247, 0.18), transparent 40%),
    linear-gradient(180deg, rgba(8, 15, 23, 0.98), rgba(16, 16, 36, 0.96));
  border-left: 1px solid rgba(136, 92, 246, 0.32);
  border-right: 1px solid rgba(136, 92, 246, 0.32);
  border-bottom: 1px solid rgba(136, 92, 246, 0.28);
  box-shadow:
    0 14px 30px rgba(0,0,0,0.34),
    0 0 22px rgba(136, 92, 246, 0.10),
    inset 0 0 22px rgba(136, 92, 246, 0.07);
  overflow: hidden;
}

.onix-island-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
}

.onix-island-logo {
  width: 25px;
  height: 25px;
  object-fit: contain;
  filter:
    drop-shadow(0 0 9px rgba(0, 229, 255, 0.52))
    drop-shadow(0 0 13px rgba(136, 92, 246, 0.46));
}

.onix-island-title {
  font-size: clamp(1.45rem, 5.5vw, 1.9rem) !important;
  line-height: 0.9;
  letter-spacing: 0.045em;
  white-space: nowrap;
}

.onix-home-locked .onix-home-screen {
  margin-top: 12px !important;
  height: calc(100vh - 170px - env(safe-area-inset-bottom));
  padding-left: 14px;
  padding-right: 14px;
  padding-bottom: calc(106px + env(safe-area-inset-bottom));
  overflow: hidden;
}

.onix-home-locked .onix-home-hero-card {
  margin-top: 0 !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  margin-top: 12px !important;
  width: min(63vw, 256px) !important;
  height: min(63vw, 256px) !important;
}

.onix-home-locked .onix-home-energy-block {
  margin-top: -3px !important;
  padding: 0 2px 10px;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 5px !important;
  height: 8px;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 0 !important;
  min-height: 48px;
}

.onix-home-locked .onix-nav {
  bottom: calc(10px + env(safe-area-inset-bottom)) !important;
}

@media (max-height: 760px) {
  .onix-header {
    min-height: 54px;
  }

  .onix-island-header {
    min-height: 56px;
    padding-top: 10px;
    padding-bottom: 9px;
  }

  .onix-island-logo {
    width: 22px;
    height: 22px;
  }

  .onix-island-title {
    font-size: 1.35rem !important;
  }

  .onix-home-locked .onix-home-screen {
    margin-top: 10px !important;
    height: calc(100vh - 158px - env(safe-area-inset-bottom));
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    width: min(59vw, 236px) !important;
    height: min(59vw, 236px) !important;
  }
}

@media (max-width: 380px) {
  .onix-island-header {
    width: min(82vw, 282px);
  }
}


/* Step 26: restore home body after compact island */
.onix-home-locked {
  min-height: 100vh !important;
  height: auto !important;
  max-height: none !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}

.onix-home-locked .onix-header {
  min-height: 62px !important;
  margin-top: 0 !important;
}

.onix-home-locked .onix-island-header {
  width: min(76vw, 292px) !important;
  min-height: 62px !important;
  padding: 12px 18px 11px !important;
}

.onix-home-locked .onix-home-screen {
  margin-top: 18px !important;
  height: auto !important;
  min-height: auto !important;
  overflow: visible !important;
  padding-left: 14px !important;
  padding-right: 14px !important;
  padding-bottom: calc(158px + env(safe-area-inset-bottom)) !important;
}

.onix-home-locked .onix-home-hero-card {
  min-height: 218px !important;
  padding: 18px 16px 16px !important;
  border-radius: 28px !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-user-row {
  align-items: flex-start !important;
}

.onix-home-locked .onix-home-balance-row {
  margin-top: 12px !important;
  display: block !important;
}

.onix-home-locked .onix-home-balance-label-pill {
  min-height: 34px !important;
  padding-left: 16px !important;
  padding-right: 16px !important;
}

.onix-home-locked .onix-home-balance-value {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  margin-top: 12px !important;
  font-size: clamp(2.55rem, 12.4vw, 4rem) !important;
  line-height: 1 !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  margin-top: 24px !important;
  width: min(66vw, 268px) !important;
  height: min(66vw, 268px) !important;
}

.onix-home-locked .onix-home-energy-block {
  margin-top: 12px !important;
  padding: 0 2px 18px !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 7px !important;
  height: 9px !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 14px !important;
  min-height: 52px !important;
}

.onix-home-locked .onix-nav {
  bottom: calc(10px + env(safe-area-inset-bottom)) !important;
  z-index: 110 !important;
}

.onix-home-locked .onix-floating-number {
  z-index: 180 !important;
}

@media (max-height: 760px) {
  .onix-home-locked .onix-home-screen {
    margin-top: 14px !important;
    padding-bottom: calc(148px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 206px !important;
    padding: 16px 15px 14px !important;
  }

  .onix-home-locked .onix-home-balance-value {
    font-size: clamp(2.35rem, 11.5vw, 3.7rem) !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 18px !important;
    width: min(63vw, 254px) !important;
    height: min(63vw, 254px) !important;
  }

  .onix-home-locked .onix-home-energy-block {
    margin-top: 8px !important;
  }
}

/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Clean isolated home screen based on reference */
html,
body,
#root {
  background: #020611 !important;
}

.onix-home-reference-mode.onix-app-bg {
  max-width: 430px !important;
  width: 100% !important;
  min-height: 100dvh !important;
  margin: 0 auto !important;
  padding-bottom: 0 !important;
  overflow: hidden !important;
  background-color: #050713 !important;
  background-image:
    radial-gradient(ellipse at 16% 7%, rgba(119, 43, 218, 0.52) 0%, rgba(84, 27, 164, 0.24) 25%, transparent 53%),
    radial-gradient(ellipse at 96% 18%, rgba(0, 129, 178, 0.24) 0%, rgba(0, 129, 178, 0.11) 24%, transparent 52%),
    radial-gradient(ellipse at 49% 49%, rgba(86, 31, 170, 0.17) 0%, transparent 58%),
    radial-gradient(ellipse at 50% 88%, rgba(78, 22, 151, 0.34) 0%, rgba(78, 22, 151, 0.10) 30%, transparent 62%),
    linear-gradient(180deg, #080a16 0%, #070916 42%, #050713 100%) !important;
  box-shadow: 0 0 0 1px rgba(126, 71, 255, 0.24), 0 0 70px rgba(96, 36, 210, 0.20) !important;
}

.onix-home-reference-mode.onix-app-bg::before {
  content: '' !important;
  position: fixed !important;
  left: 50% !important;
  top: 54px !important;
  bottom: 0 !important;
  width: min(100vw, 430px) !important;
  transform: translateX(-50%) !important;
  z-index: 0 !important;
  pointer-events: none !important;
  opacity: 1 !important;
  background-image:
    linear-gradient(90deg, rgba(116, 83, 210, 0.052) 1px, transparent 1px),
    linear-gradient(180deg, rgba(116, 83, 210, 0.034) 1px, transparent 1px),
    radial-gradient(circle at 7% 12%, rgba(255,255,255,0.34) 0 1px, transparent 1.5px),
    radial-gradient(circle at 20% 26%, rgba(158, 94, 255,0.28) 0 1px, transparent 1.5px),
    radial-gradient(circle at 83% 16%, rgba(68, 205, 255,0.28) 0 1px, transparent 1.5px),
    radial-gradient(circle at 66% 40%, rgba(255,255,255,0.16) 0 1px, transparent 1.45px),
    radial-gradient(circle at 13% 58%, rgba(179, 105, 255,0.20) 0 1px, transparent 1.45px),
    radial-gradient(circle at 88% 72%, rgba(68, 205, 255,0.14) 0 1px, transparent 1.45px) !important;
  background-size: 52px 52px, 52px 52px, 118px 118px, 158px 158px, 178px 178px, 138px 138px, 170px 170px, 190px 190px !important;
}

.onix-home-reference-mode.onix-app-bg::after {
  content: '' !important;
  position: fixed !important;
  left: 50% !important;
  top: 54px !important;
  bottom: 0 !important;
  width: min(100vw, 430px) !important;
  transform: translateX(-50%) !important;
  z-index: 1 !important;
  pointer-events: none !important;
  background:
    radial-gradient(ellipse at 24% 13%, rgba(137, 74, 255, 0.19) 0%, transparent 31%),
    radial-gradient(ellipse at 96% 28%, rgba(0, 195, 255, 0.10) 0%, transparent 24%),
    radial-gradient(ellipse at 50% 78%, rgba(124, 49, 232, 0.20) 0%, transparent 32%),
    linear-gradient(180deg, rgba(5, 7, 19, 0.00) 0%, rgba(5, 7, 19, 0.08) 55%, rgba(5, 7, 19, 0.35) 100%) !important;
}

.onix-home-reference-mode [aria-label="ONIX top navigation"] {
  height: 54px !important;
  min-height: 54px !important;
  padding: 0 16px !important;
  background: rgba(3, 6, 16, 0.78) !important;
  border-bottom: 1px solid rgba(145, 103, 255, 0.28) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25) !important;
  backdrop-filter: blur(12px) !important;
}

.onix-ref-v5-screen {
  position: relative !important;
  z-index: 10 !important;
  width: 100% !important;
  max-width: 430px !important;
  height: calc(100dvh - 54px) !important;
  margin: 0 auto !important;
  padding: 17px 22px calc(26px + env(safe-area-inset-bottom)) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

.onix-ref-v5-player {
  width: 100% !important;
  min-height: 60px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  margin-top: 2px !important;
}

.onix-ref-v5-player-left {
  min-width: 0 !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}

.onix-ref-v5-avatar {
  width: 54px !important;
  height: 54px !important;
  flex: 0 0 54px !important;
  border-radius: 999px !important;
  display: grid !important;
  place-items: center !important;
  overflow: hidden !important;
  background: radial-gradient(circle at 50% 45%, rgba(93, 42, 212, 0.35), rgba(7, 11, 26, 0.96) 64%) !important;
  border: 2px solid rgba(120, 83, 255, 0.95) !important;
  box-shadow: 0 0 17px rgba(120, 83, 255, 0.62), inset 0 0 17px rgba(0, 229, 255, 0.12) !important;
}

.onix-ref-v5-avatar img {
  width: 80% !important;
  height: 80% !important;
  object-fit: contain !important;
}

.onix-ref-v5-player-text {
  min-width: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
}

.onix-ref-v5-name {
  margin: 0 !important;
  max-width: 180px !important;
  color: #ffffff !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 14px !important;
  line-height: 1.1 !important;
  font-weight: 900 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.onix-ref-v5-rank {
  margin: 4px 0 0 !important;
  max-width: 180px !important;
  color: #9c55ff !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 10px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.onix-ref-v5-rank-badge {
  width: 56px !important;
  height: 58px !important;
  flex: 0 0 56px !important;
  display: grid !important;
  place-items: center !important;
  filter: drop-shadow(0 0 10px rgba(133, 76, 255, 0.95)) drop-shadow(0 0 24px rgba(107, 50, 236, 0.55)) !important;
}

.onix-ref-v5-rank-badge img {
  width: 54px !important;
  height: 54px !important;
  object-fit: contain !important;
}

.onix-ref-v5-balance {
  width: 100% !important;
  margin-top: 18px !important;
  text-align: center !important;
}

.onix-ref-v5-balance-value {
  margin: 0 !important;
  padding: 0 !important;
  color: #f6c833 !important;
  background: none !important;
  -webkit-text-fill-color: #f6c833 !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: clamp(3.05rem, 12.9vw, 4.45rem) !important;
  line-height: 0.84 !important;
  font-weight: 900 !important;
  letter-spacing: -0.058em !important;
  text-align: center !important;
  text-shadow: 0 0 10px rgba(250, 204, 21, 0.24), 0 0 22px rgba(250, 204, 21, 0.12) !important;
}

.onix-ref-v5-balance-label {
  margin: 5px 0 0 !important;
  padding: 0 !important;
  color: #f6c833 !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 12px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  text-align: center !important;
  text-transform: uppercase !important;
  text-shadow: 0 0 12px rgba(250, 204, 21, 0.30) !important;
}

.onix-ref-v5-coin {
  position: relative !important;
  flex: 0 0 auto !important;
  width: min(78vw, 306px) !important;
  height: min(78vw, 306px) !important;
  max-width: 306px !important;
  max-height: 306px !important;
  margin-top: 14px !important;
  padding: 0 !important;
  display: grid !important;
  place-items: center !important;
  cursor: pointer !important;
  transition: transform 120ms ease !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.onix-ref-v5-coin-tapped {
  transform: scale(0.94) !important;
}

.onix-ref-v5-coin img {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  user-select: none !important;
  pointer-events: none !important;
  filter: drop-shadow(0 0 16px rgba(145, 74, 255, 0.86)) drop-shadow(0 0 36px rgba(68, 205, 255, 0.24)) !important;
}

.onix-ref-v5-energy {
  width: 100% !important;
  margin-top: 8px !important;
}

.onix-ref-v5-energy-text {
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
  color: #cfd7f2 !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 12px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  white-space: nowrap !important;
}

.onix-ref-v5-energy-icon {
  width: 14px !important;
  height: 14px !important;
  color: #f6c833 !important;
  fill: #f6c833 !important;
}

.onix-ref-v5-energy-text strong {
  color: #f6c833 !important;
}

.onix-ref-v5-energy-status {
  color: #a9aec5 !important;
  font-weight: 800 !important;
}

.onix-ref-v5-energy-track {
  width: 100% !important;
  height: 7px !important;
  margin-top: 8px !important;
  border-radius: 999px !important;
  overflow: hidden !important;
  background: rgba(12, 17, 37, 0.94) !important;
  border: 1px solid rgba(125, 83, 255, 0.24) !important;
  box-shadow: inset 0 0 9px rgba(0, 0, 0, 0.55) !important;
}

.onix-ref-v5-energy-fill {
  height: 100% !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg, #10d6e8 0%, #47bbff 43%, #8e55ff 100%) !important;
  box-shadow: 0 0 12px rgba(0, 229, 255, 0.45), 0 0 14px rgba(139, 92, 246, 0.42) !important;
}

.onix-ref-v5-tap-button {
  width: 100% !important;
  height: 60px !important;
  min-height: 60px !important;
  margin-top: 16px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(168, 85, 247, 0.60) !important;
  background: linear-gradient(180deg, #8f35ff 0%, #6519d7 100%) !important;
  color: #ffffff !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 18px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  letter-spacing: 0.045em !important;
  text-transform: uppercase !important;
  box-shadow: 0 0 26px rgba(129, 55, 245, 0.58), inset 0 1px 0 rgba(255,255,255,0.20) !important;
}

.onix-home-reference-mode .onix-nav {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
  transform: translateX(-50%) !important;
  z-index: 900 !important;
  width: min(calc(100vw - 16px), 414px) !important;
  max-width: 414px !important;
  height: 58px !important;
  padding: 4px 7px !important;
  border-radius: 17px !important;
  background: rgba(4, 7, 18, 0.94) !important;
  border: 1px solid rgba(129, 69, 255, 0.48) !important;
  box-shadow: 0 0 20px rgba(91, 33, 246, 0.30), inset 0 0 18px rgba(129, 69, 255, 0.08) !important;
}

.onix-home-reference-mode .onix-nav button {
  min-width: 0 !important;
  padding: 5px 2px !important;
  border-radius: 12px !important;
  gap: 2px !important;
  font-size: 9px !important;
  line-height: 1 !important;
}

.onix-home-reference-mode .onix-nav button svg {
  width: 16px !important;
  height: 16px !important;
}

.onix-home-reference-mode .onix-nav button.onix-nav-active {
  background: rgba(71, 85, 150, 0.56) !important;
  color: #ffffff !important;
  box-shadow: inset 0 0 16px rgba(114, 137, 255, 0.36), 0 0 14px rgba(114, 137, 255, 0.24) !important;
}

@media (max-height: 760px) {
  .onix-ref-v5-screen {
    padding-top: 12px !important;
    padding-bottom: calc(24px + env(safe-area-inset-bottom)) !important;
  }

  .onix-ref-v5-balance {
    margin-top: 11px !important;
  }

  .onix-ref-v5-balance-value {
    font-size: clamp(2.72rem, 11.3vw, 3.65rem) !important;
  }

  .onix-ref-v5-coin {
    width: min(68vw, 264px) !important;
    height: min(68vw, 264px) !important;
    margin-top: 8px !important;
  }

  .onix-ref-v5-tap-button {
    height: 56px !important;
    min-height: 56px !important;
    margin-top: 14px !important;
  }

  .onix-home-reference-mode .onix-nav {
    height: 56px !important;
  }
}


/* v8 bottom spacing refinement */
.onix-home-reference-mode .onix-ref-v5-energy {
  flex: 0 0 auto !important;
}

@media (max-height: 760px) {
  .onix-home-reference-mode .onix-ref-v5-energy {
    margin-top: -4px !important;
  }
}


/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Hard final override: massive TAP button and lower button block above bottom menu */
.onix-home-reference-mode .onix-ref-v5-coin {
  width: min(77vw, 300px) !important;
  height: min(77vw, 300px) !important;
  max-width: 300px !important;
  max-height: 300px !important;
  margin-top: 12px !important;
  transform: translateY(42px) !important;
}

.onix-home-reference-mode .onix-ref-v5-coin-tapped {
  transform: translateY(42px) scale(0.94) !important;
}

.onix-home-reference-mode .onix-ref-v5-energy {
  transform: translateY(42px) !important;
  margin-top: 0 !important;
}

.onix-home-reference-mode .onix-ref-v5-tap-button {
  height: 68px !important;
  min-height: 68px !important;
  margin-top: 16px !important;
  border-radius: 15px !important;
  font-size: 21px !important;
  letter-spacing: 0.055em !important;
  background: linear-gradient(180deg, #a647ff 0%, #7d1ff0 48%, #6519d7 100%) !important;
  box-shadow:
    0 0 30px rgba(129, 55, 245, 0.68),
    0 14px 34px rgba(75, 20, 180, 0.36),
    inset 0 1px 0 rgba(255,255,255,0.24) !important;
}

.onix-home-reference-mode .onix-nav {
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
}

@media (max-height: 760px) {
  .onix-home-reference-mode .onix-ref-v5-coin {
    width: min(66vw, 255px) !important;
    height: min(66vw, 255px) !important;
    max-width: 255px !important;
    max-height: 255px !important;
    margin-top: 6px !important;
    transform: translateY(48px) !important;
  }

  .onix-home-reference-mode .onix-ref-v5-coin-tapped {
    transform: translateY(48px) scale(0.94) !important;
  }

  .onix-home-reference-mode .onix-ref-v5-energy {
    transform: translateY(48px) !important;
    margin-top: -2px !important;
  }

  .onix-home-reference-mode .onix-ref-v5-tap-button {
    height: 64px !important;
    min-height: 64px !important;
    margin-top: 14px !important;
    border-radius: 14px !important;
    font-size: 20px !important;
  }
}



/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Bottom navigation polish only */
.onix-home-reference-mode .onix-nav {
  height: 64px !important;
  padding: 5px 7px !important;
  border-radius: 20px !important;
  background:
    radial-gradient(circle at 8% 50%, rgba(91, 123, 255, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(6, 9, 25, 0.96), rgba(4, 6, 18, 0.98)) !important;
  border: 1px solid rgba(142, 92, 255, 0.52) !important;
  box-shadow:
    0 0 24px rgba(91, 33, 246, 0.34),
    0 12px 32px rgba(0, 0, 0, 0.42),
    inset 0 0 20px rgba(129, 69, 255, 0.10) !important;
  backdrop-filter: blur(18px) !important;
}

.onix-home-reference-mode .onix-nav button {
  min-width: 0 !important;
  height: 52px !important;
  padding: 6px 3px 5px !important;
  border-radius: 16px !important;
  gap: 3px !important;
  color: rgba(220, 224, 244, 0.72) !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  transition: transform 120ms ease, color 120ms ease, background 120ms ease !important;
}

.onix-home-reference-mode .onix-nav button svg {
  width: 18px !important;
  height: 18px !important;
  stroke-width: 2.05 !important;
  color: rgba(220, 224, 244, 0.78) !important;
  filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.34)) !important;
}

.onix-home-reference-mode .onix-nav button.onix-nav-active {
  background:
    radial-gradient(circle at 50% 18%, rgba(132, 169, 255, 0.26), transparent 52%),
    linear-gradient(180deg, rgba(69, 92, 166, 0.78), rgba(42, 58, 118, 0.78)) !important;
  color: #ffffff !important;
  border: 1px solid rgba(174, 194, 255, 0.22) !important;
  box-shadow:
    inset 0 0 18px rgba(124, 151, 255, 0.34),
    0 0 18px rgba(114, 137, 255, 0.28) !important;
}

.onix-home-reference-mode .onix-nav button.onix-nav-active svg {
  color: #ffffff !important;
  filter:
    drop-shadow(0 0 8px rgba(179, 197, 255, 0.58))
    drop-shadow(0 0 14px rgba(114, 137, 255, 0.35)) !important;
}

.onix-home-reference-mode .onix-nav button:active {
  transform: scale(0.96) !important;
}

@media (max-width: 380px) {
  .onix-home-reference-mode .onix-nav {
    width: min(calc(100vw - 14px), 414px) !important;
    height: 62px !important;
    padding: 5px !important;
    border-radius: 18px !important;
  }

  .onix-home-reference-mode .onix-nav button {
    height: 50px !important;
    padding-left: 2px !important;
    padding-right: 2px !important;
    font-size: 9px !important;
  }

  .onix-home-reference-mode .onix-nav button svg {
    width: 17px !important;
    height: 17px !important;
  }
}



/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Upgrade screen redesign based on reference */
.onix-upgrades-ref-screen {
  padding: 14px 16px calc(88px + env(safe-area-inset-bottom)) !important;
}

.onix-upgrades-ref-wallets {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 12px !important;
  margin-bottom: 18px !important;
}

.onix-upgrades-ref-wallet {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 14px 14px !important;
  border-radius: 18px !important;
  border: 1px solid rgba(138, 92, 246, 0.28) !important;
  background: linear-gradient(180deg, rgba(10, 15, 33, 0.98), rgba(7, 10, 25, 0.98)) !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28), inset 0 0 20px rgba(132, 86, 255, 0.08) !important;
}

.onix-upgrades-ref-wallet-onix .onix-upgrades-ref-wallet-icon {
  background: radial-gradient(circle at 30% 30%, rgba(255, 214, 79, 0.55), rgba(219, 150, 22, 0.32) 55%, rgba(23, 19, 17, 0.95) 100%) !important;
  color: #ffd552 !important;
}

.onix-upgrades-ref-wallet-gems .onix-upgrades-ref-wallet-icon {
  background: radial-gradient(circle at 30% 30%, rgba(97, 217, 255, 0.48), rgba(20, 87, 255, 0.26) 55%, rgba(13, 17, 34, 0.95) 100%) !important;
  color: #64dcff !important;
}

.onix-upgrades-ref-wallet-icon {
  width: 42px !important;
  height: 42px !important;
  flex: 0 0 42px !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  font-size: 20px !important;
  box-shadow: 0 0 16px rgba(130, 96, 255, 0.24) !important;
}

.onix-upgrades-ref-wallet-value {
  color: #ffffff !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 24px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
}

.onix-upgrades-ref-wallet-label {
  margin-top: 3px !important;
  color: rgba(255,255,255,0.72) !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}

.onix-upgrades-ref-tabs {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 8px !important;
  margin-bottom: 14px !important;
  border-bottom: 1px solid rgba(132, 96, 255, 0.24) !important;
  padding-bottom: 10px !important;
}

.onix-upgrades-ref-tab {
  position: relative !important;
  padding: 8px 2px 10px !important;
  background: transparent !important;
  border: 0 !important;
  color: rgba(205, 210, 231, 0.72) !important;
  font-size: 12px !important;
  line-height: 1.1 !important;
  font-weight: 700 !important;
}

.onix-upgrades-ref-tab-active {
  color: #ffffff !important;
}

.onix-upgrades-ref-tab-active::after {
  content: '' !important;
  position: absolute !important;
  left: 14% !important;
  right: 14% !important;
  bottom: 0 !important;
  height: 2px !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg, #932bff 0%, #d04cff 100%) !important;
  box-shadow: 0 0 12px rgba(175, 70, 255, 0.75) !important;
}

.onix-upgrades-ref-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
}

.onix-upgrade-ref-card {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 13px 12px !important;
  border-radius: 18px !important;
  border: 1px solid rgba(108, 67, 212, 0.34) !important;
  background: linear-gradient(180deg, rgba(13, 18, 36, 0.98), rgba(8, 11, 24, 0.98)) !important;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.26), inset 0 0 18px rgba(141, 90, 255, 0.08) !important;
}

.onix-upgrade-ref-icon {
  width: 48px !important;
  height: 48px !important;
  flex: 0 0 48px !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 14px !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  font-size: 24px !important;
}

.onix-upgrade-ref-icon-violet { background: radial-gradient(circle at 30% 30%, rgba(195, 95, 255, 0.46), rgba(84, 18, 192, 0.26) 58%, rgba(14, 11, 35, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(168, 85, 247, 0.28) !important; }
.onix-upgrade-ref-icon-gold { background: radial-gradient(circle at 30% 30%, rgba(255, 210, 71, 0.48), rgba(193, 120, 20, 0.24) 58%, rgba(25, 16, 8, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(251, 191, 36, 0.22) !important; }
.onix-upgrade-ref-icon-cyan { background: radial-gradient(circle at 30% 30%, rgba(88, 243, 255, 0.42), rgba(10, 95, 203, 0.24) 58%, rgba(8, 15, 31, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(34, 211, 238, 0.22) !important; }
.onix-upgrade-ref-icon-blue { background: radial-gradient(circle at 30% 30%, rgba(92, 174, 255, 0.46), rgba(50, 90, 229, 0.26) 58%, rgba(11, 18, 35, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(96, 165, 250, 0.22) !important; }
.onix-upgrade-ref-icon-pink { background: radial-gradient(circle at 30% 30%, rgba(255, 100, 209, 0.42), rgba(141, 36, 145, 0.26) 58%, rgba(25, 8, 29, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(244, 114, 182, 0.22) !important; }
.onix-upgrade-ref-icon-emerald { background: radial-gradient(circle at 30% 30%, rgba(74, 255, 174, 0.42), rgba(16, 141, 86, 0.24) 58%, rgba(8, 28, 24, 0.96) 100%) !important; box-shadow: 0 0 20px rgba(16, 185, 129, 0.22) !important; }

.onix-upgrade-ref-main {
  min-width: 0 !important;
  flex: 1 1 auto !important;
}

.onix-upgrade-ref-title {
  color: #ffffff !important;
  font-size: 15px !important;
  line-height: 1.1 !important;
  font-weight: 800 !important;
}

.onix-upgrade-ref-level {
  margin-top: 4px !important;
  color: rgba(199, 163, 255, 0.82) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  font-weight: 700 !important;
}

.onix-upgrade-ref-subtitle {
  margin-top: 5px !important;
  color: rgba(255, 209, 84, 0.88) !important;
  font-size: 12px !important;
  line-height: 1.15 !important;
  font-weight: 700 !important;
}

.onix-upgrade-ref-buy {
  align-self: center !important;
  min-width: 90px !important;
  height: 36px !important;
  padding: 0 12px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  border-radius: 11px !important;
  border: 1px solid rgba(255, 191, 35, 0.52) !important;
  background: linear-gradient(180deg, rgba(45, 30, 9, 0.98), rgba(22, 16, 7, 0.98)) !important;
  color: #ffca39 !important;
  font-size: 13px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
  box-shadow: inset 0 0 14px rgba(255, 188, 39, 0.08), 0 0 12px rgba(255, 188, 39, 0.08) !important;
}

.onix-upgrade-ref-buy-icon {
  font-size: 14px !important;
}

.onix-upgrade-ref-buy-disabled {
  opacity: 0.52 !important;
}

@media (max-width: 380px) {
  .onix-upgrades-ref-screen {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }

  .onix-upgrades-ref-wallet-value {
    font-size: 21px !important;
  }

  .onix-upgrades-ref-tab {
    font-size: 11px !important;
  }

  .onix-upgrade-ref-card {
    gap: 10px !important;
    padding: 12px 10px !important;
  }

  .onix-upgrade-ref-icon {
    width: 44px !important;
    height: 44px !important;
    flex-basis: 44px !important;
    font-size: 22px !important;
  }

  .onix-upgrade-ref-buy {
    min-width: 82px !important;
    height: 34px !important;
    font-size: 12px !important;
    padding: 0 10px !important;
  }
}


/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Remove old rank/balance blocks from Upgrades screen */
.onix-boosts-screen > .rounded-3xl,
.onix-boosts-screen > .onix-rank-card,
.onix-boosts-screen > .onix-balance-card,
.onix-boosts-screen > .onix-home-balance-row,
.onix-boosts-screen > .onix-home-level-row,
.onix-boosts-screen > .oc-seamless-player-block {
  display: none !important;
}

.onix-boosts-screen {
  margin-top: 0 !important;
  padding-top: 14px !important;
  padding-left: 16px !important;
  padding-right: 16px !important;
  padding-bottom: calc(88px + env(safe-area-inset-bottom)) !important;
  gap: 0 !important;
  background: transparent !important;
}

.onix-boosts-screen .onix-upgrades-ref-screen {
  padding-top: 0 !important;
}

/* Keep only reference wallet cards */
.onix-upgrades-ref-wallets {
  margin-top: 0 !important;
  margin-bottom: 18px !important;
}

.onix-upgrades-ref-wallet {
  min-height: 76px !important;
}

/* Make upgrades list start cleanly under tabs */
.onix-upgrades-ref-tabs {
  margin-top: 0 !important;
}

@media (max-width: 380px) {
  .onix-boosts-screen {
    padding-left: 12px !important;
    padding-right: 12px !important;
  }
}



/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Old global rank/balance header is disabled on Upgrades tab in JSX */


/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Profile screen redesign based on reference */
.onix-social-screen {
  margin-top: 0 !important;
  padding: 18px 18px calc(88px + env(safe-area-inset-bottom)) !important;
  background: transparent !important;
}

/* Hide old profile content, keep it in JSX so existing logic stays intact */
.onix-social-screen > :not(.onix-profile-ref-screen) {
  display: none !important;
}

.onix-profile-ref-screen {
  position: relative !important;
  z-index: 5 !important;
  width: 100% !important;
  max-width: 430px !important;
  margin: 0 auto !important;
  color: #ffffff !important;
}

.onix-profile-ref-head {
  display: flex !important;
  align-items: center !important;
  gap: 14px !important;
  padding: 8px 4px 14px !important;
}

.onix-profile-ref-avatar {
  width: 86px !important;
  height: 86px !important;
  flex: 0 0 86px !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 24px !important;
  background:
    radial-gradient(circle at 50% 45%, rgba(137, 74, 255, 0.42), rgba(17, 11, 37, 0.98) 64%),
    linear-gradient(180deg, rgba(25, 17, 55, 0.96), rgba(8, 10, 24, 0.96)) !important;
  border: 1px solid rgba(172, 102, 255, 0.44) !important;
  box-shadow:
    0 0 22px rgba(145, 74, 255, 0.48),
    inset 0 0 24px rgba(0, 229, 255, 0.08) !important;
  overflow: hidden !important;
}

.onix-profile-ref-avatar img {
  width: 78% !important;
  height: 78% !important;
  object-fit: contain !important;
  filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.62)) !important;
}

.onix-profile-ref-user {
  min-width: 0 !important;
}

.onix-profile-ref-name {
  color: #ffffff !important;
  font-family: 'Exo 2', system-ui, sans-serif !important;
  font-size: 20px !important;
  line-height: 1.05 !important;
  font-weight: 900 !important;
  letter-spacing: -0.015em !important;
}

.onix-profile-ref-rank {
  margin-top: 5px !important;
  color: #a855f7 !important;
  font-size: 13px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
}

.onix-profile-ref-level {
  padding: 0 4px 18px !important;
}

.onix-profile-ref-level-row {
  display: flex !important;
  justify-content: space-between !important;
  gap: 12px !important;
  color: rgba(226, 232, 255, 0.72) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  font-weight: 700 !important;
}

.onix-profile-ref-progress {
  margin-top: 10px !important;
  height: 8px !important;
  overflow: hidden !important;
  border-radius: 999px !important;
  background: rgba(12, 17, 37, 0.92) !important;
  border: 1px solid rgba(125, 83, 255, 0.20) !important;
  box-shadow: inset 0 0 9px rgba(0,0,0,0.56) !important;
}

.onix-profile-ref-progress-fill {
  height: 100% !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg, #18d5ff 0%, #7a4cff 52%, #d04cff 100%) !important;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.62) !important;
}

.onix-profile-ref-stats {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important;
  margin-top: 4px !important;
}

.onix-profile-ref-stat {
  min-height: 78px !important;
  padding: 14px 14px !important;
  border-radius: 16px !important;
  background: linear-gradient(180deg, rgba(13, 18, 36, 0.96), rgba(8, 11, 24, 0.98)) !important;
  border: 1px solid rgba(119, 80, 219, 0.22) !important;
  box-shadow: inset 0 0 18px rgba(120, 83, 255, 0.06), 0 10px 24px rgba(0,0,0,0.24) !important;
}

.onix-profile-ref-stat span {
  display: block !important;
  color: rgba(202, 208, 231, 0.70) !important;
  font-size: 11px !important;
  line-height: 1.1 !important;
  font-weight: 700 !important;
}

.onix-profile-ref-stat strong {
  display: block !important;
  margin-top: 9px !important;
  color: #ffffff !important;
  font-size: 18px !important;
  line-height: 1.05 !important;
  font-weight: 900 !important;
  word-break: break-word !important;
}

.onix-profile-ref-menu {
  margin-top: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

.onix-profile-ref-menu-item {
  width: 100% !important;
  min-height: 52px !important;
  display: grid !important;
  grid-template-columns: 28px 1fr auto 16px !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 0 14px !important;
  border: 1px solid rgba(119, 80, 219, 0.22) !important;
  border-radius: 14px !important;
  background: linear-gradient(180deg, rgba(13, 18, 36, 0.96), rgba(8, 11, 24, 0.98)) !important;
  color: #ffffff !important;
  box-shadow: inset 0 0 18px rgba(120, 83, 255, 0.05) !important;
}

.onix-profile-ref-menu-item span {
  font-size: 17px !important;
}

.onix-profile-ref-menu-item strong {
  text-align: left !important;
  font-size: 14px !important;
  line-height: 1 !important;
  font-weight: 800 !important;
}

.onix-profile-ref-menu-item em {
  color: rgba(202, 208, 231, 0.58) !important;
  font-style: normal !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}

.onix-profile-ref-menu-item b {
  color: rgba(255,255,255,0.56) !important;
  font-size: 22px !important;
  line-height: 1 !important;
  font-weight: 400 !important;
}

@media (max-width: 380px) {
  .onix-social-screen {
    padding-left: 14px !important;
    padding-right: 14px !important;
  }

  .onix-profile-ref-avatar {
    width: 78px !important;
    height: 78px !important;
    flex-basis: 78px !important;
  }

  .onix-profile-ref-name {
    font-size: 18px !important;
  }

  .onix-profile-ref-stat strong {
    font-size: 16px !important;
  }
}



/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Rank icons: Novice / Bronze / Silver / Gold / Platinum / Diamond / Grandmaster */
.onix-rank-icon {
  --rank-main: #8ea0c9;
  --rank-secondary: #d3d9ff;
  --rank-core: #99a7cf;
  --rank-glow: rgba(142, 160, 201, 0.48);
  --rank-bg: rgba(9, 12, 28, 0.96);
  display: grid !important;
  place-items: center !important;
  position: relative !important;
  flex: 0 0 auto !important;
  filter:
    drop-shadow(0 0 8px var(--rank-glow))
    drop-shadow(0 0 18px color-mix(in srgb, var(--rank-main), transparent 62%)) !important;
}

.onix-rank-icon-sm { width: 42px !important; height: 42px !important; }
.onix-rank-icon-md { width: 56px !important; height: 56px !important; }
.onix-rank-icon-lg { width: 88px !important; height: 88px !important; }

.onix-rank-icon svg {
  width: 100% !important;
  height: 100% !important;
  overflow: visible !important;
}

.onix-rank-outer {
  fill: var(--rank-bg) !important;
  stroke: var(--rank-main) !important;
  stroke-width: 3.2 !important;
}

.onix-rank-frame {
  fill: rgba(255,255,255,0.045) !important;
  stroke: var(--rank-secondary) !important;
  stroke-width: 3 !important;
}

.onix-rank-diamond-back {
  fill: rgba(255,255,255,0.08) !important;
  stroke: var(--rank-main) !important;
  stroke-width: 2.2 !important;
}

.onix-rank-diamond-left {
  fill: color-mix(in srgb, var(--rank-main), #050713 34%) !important;
}

.onix-rank-diamond-right {
  fill: color-mix(in srgb, var(--rank-secondary), #050713 22%) !important;
}

.onix-rank-core {
  fill: var(--rank-core) !important;
  filter: drop-shadow(0 0 7px var(--rank-glow)) !important;
}

.onix-rank-wing {
  fill: color-mix(in srgb, var(--rank-main), #050713 42%) !important;
  opacity: 0.88 !important;
}

.onix-rank-spark {
  fill: var(--rank-secondary) !important;
  opacity: 0.92 !important;
}

.onix-rank-icon-novice {
  --rank-main: #8f98b7;
  --rank-secondary: #d9def2;
  --rank-core: #a7b2d8;
  --rank-glow: rgba(158, 171, 217, 0.42);
  --rank-bg: rgba(12, 15, 33, 0.96);
}

.onix-rank-icon-bronze {
  --rank-main: #b66a3a;
  --rank-secondary: #ffc08a;
  --rank-core: #e2844b;
  --rank-glow: rgba(230, 132, 75, 0.42);
  --rank-bg: rgba(31, 14, 11, 0.96);
}

.onix-rank-icon-silver {
  --rank-main: #aeb7e6;
  --rank-secondary: #f0f3ff;
  --rank-core: #c4cbf7;
  --rank-glow: rgba(196, 203, 247, 0.44);
  --rank-bg: rgba(13, 16, 34, 0.96);
}

.onix-rank-icon-gold {
  --rank-main: #f8b927;
  --rank-secondary: #fff2a6;
  --rank-core: #ffd34a;
  --rank-glow: rgba(255, 211, 74, 0.52);
  --rank-bg: rgba(34, 21, 7, 0.96);
}

.onix-rank-icon-platinum {
  --rank-main: #8fc9ff;
  --rank-secondary: #d9efff;
  --rank-core: #a4d8ff;
  --rank-glow: rgba(143, 201, 255, 0.48);
  --rank-bg: rgba(8, 20, 35, 0.96);
}

.onix-rank-icon-diamond {
  --rank-main: #2197ff;
  --rank-secondary: #8fe8ff;
  --rank-core: #36d6ff;
  --rank-glow: rgba(54, 214, 255, 0.52);
  --rank-bg: rgba(5, 15, 34, 0.96);
}

.onix-rank-icon-grandmaster {
  --rank-main: #9b39ff;
  --rank-secondary: #ff8cff;
  --rank-core: #d85cff;
  --rank-glow: rgba(216, 92, 255, 0.58);
  --rank-bg: rgba(23, 8, 40, 0.96);
}

.onix-ref-v5-rank-badge .onix-rank-icon-md {
  width: 58px !important;
  height: 58px !important;
}

.onix-profile-ref-avatar .onix-rank-icon-lg {
  width: 82px !important;
  height: 82px !important;
}

.onix-profile-ref-avatar {
  border-radius: 28px !important;
}



/* === REFERENCE HOME SCREEN PATCH v17 === */
/* Rank icons now use exact cropped reference images */
.onix-rank-icon {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-rank-icon-image {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  display: block !important;
  user-select: none !important;
  pointer-events: none !important;
}

.onix-ref-v5-rank-badge .onix-rank-icon-md {
  width: 64px !important;
  height: 64px !important;
  filter: drop-shadow(0 0 13px rgba(180, 70, 255, 0.64)) drop-shadow(0 0 24px rgba(127, 50, 236, 0.42)) !important;
}

.onix-profile-ref-avatar .onix-rank-icon-lg {
  width: 86px !important;
  height: 86px !important;
  filter: drop-shadow(0 0 16px rgba(180, 70, 255, 0.60)) drop-shadow(0 0 28px rgba(127, 50, 236, 0.42)) !important;
}

.onix-profile-ref-avatar {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

`;


type Tab = 'home' | 'boosts' | 'tasks' | 'friends' | 'wallet' | 'launch';

type BoostSubTab = 'tapping' | 'energy' | 'boosts' | 'other';

type FloatingNumber = {
  id: number;
  x: number;
  y: number;
  value: number;
};

type Transaction = {
  type: string;
  amount: number;
  title: string;
  status?: string;
  createdAt?: number;
};

type TransactionFilter =
  | 'all'
  | 'income'
  | 'expense'
  | 'withdrawal'
  | 'referral'
  | 'season'
  | 'missions';

type AdminUserSearchResult = {
  telegramId: string;
  username: string;
  balance: number;
  totalEarned: number;
  weeklyEarned: number;
  referralsCount: number;
  totalTaps: number;
  isSuspicious: boolean;
  isFrozen: boolean;
  frozenReason: string;
};

type AdminOperationsPayload = {
  withdrawals: Array<AdminWithdrawalRequest & {
    telegramId: string;
    username: string;
  }>;
  transactions: Array<Transaction & {
    telegramId: string;
    username: string;
  }>;
};

type AdminUserProfile = AdminUserSearchResult & {
  totalBoostsUsed: number;
  totalUpgradesBought: number;
  offlineClaimsCount: number;
  level: number;
  selectedTitle: string;
  league: string;
  suspiciousReasons: string[];
  transactions: Transaction[];
  withdrawalRequests: WithdrawalRequest[];
  securityLogs: Array<{
    type: string;
    title: string;
    details: string;
    createdAt: number;
  }>;
  adminNotes: Array<{
    text: string;
    adminTelegramId: string;
    createdAt: number;
  }>;
};

type AdminSecurityLog = {
  telegramId: string;
  username: string;
  isFrozen: boolean;
  isSuspicious: boolean;
  type: string;
  title: string;
  details: string;
  createdAt: number;
};

type AdminEconomyDashboard = {
  economyConfig: any;
  totals: {
    users: number;
    frozenUsers: number;
    suspiciousUsers: number;
    totalBalance: number;
    totalEarned: number;
    weeklyEarned: number;
    referrals: number;
    taps: number;
    pendingWithdrawals: number;
    pendingWithdrawOnix: number;
    approvedWithdrawals: number;
    rejectedWithdrawals: number;
    createdOnix: number;
    spentOnix: number;
    totalBalanceEur: number;
    pendingWithdrawEur: number;
  };
  transactionTypes: Array<{
    type: string;
    count: number;
    amount: number;
  }>;
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  reward: number;
  goal: number;
  progress: number;
  isCompleted: boolean;
};

type AchievementCategory =
  | 'all'
  | 'taps'
  | 'miner'
  | 'referrals'
  | 'seasons'
  | 'perks'
  | 'daily'
  | 'ranks';

type RewardPopupItem = {
  icon: string;
  title: string;
  amount: number;
};

type LeaderboardItem = {
  place: number;
  telegramId?: string;
  username: string;
  weeklyEarned: number;
  totalEarned: number;
};

type ReferralLimit = {
  used: number;
  max: number;
  remaining: number;
  resetAt: number;
  secondsUntilReset: number;
  isLimitReached: boolean;
};

type EconomyConfig = {
  onixEurPer1000: number;
  minWithdrawOnix: number;
  referralReward: number;
  referredUserReward: number;
  maxPaidReferralsPerDay: number;
};

type AdminPrizePreview = {
  place: number;
  telegramId: string;
  username: string;
  weeklyEarned: number;
  totalEarned: number;
  balance: number;
  prize: number;
};

type AdminPrizePreviewResponse = {
  week: string;
  alreadyAwarded: boolean;
  awardedAt: number | null;
  awardedWinners: AdminPrizePreview[];
  preview: AdminPrizePreview[];
};

type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
};

type SeasonHistoryItem = {
  week: string;
  awardedAt: number;
  winners: Array<{
    place: number;
    username: string;
    weeklyEarned: number;
    prize: number;
  }>;
};

type TeamLeaderboardItem = {
  place: number;
  teamName: string;
  weeklyEarned: number;
  members: number;
};

type TeamMissionItem = {
  id: string;
  title: string;
  description: string;
  goal: number;
  progress: number;
  reward: number;
  isCompleted: boolean;
  isClaimed: boolean;
};

type TeamSocialDashboard = {
  team: {
    teamName: string;
    members: number;
    weeklyEarned: number;
    totalEarned: number;
    totalTaps: number;
    teamCode: string;
    place: number | null;
    membersList: Array<{
      telegramId: string;
      username: string;
      weeklyEarned: number;
      totalEarned: number;
      totalTaps: number;
      referralsCount: number;
    }>;
  };
  teamMissions: TeamMissionItem[];
  teamPrize: number;
  week: string;
};

type FriendLeaderboardItem = {
  place: number;
  telegramId: string;
  username: string;
  totalEarned: number;
  weeklyEarned: number;
  referralsCount: number;
  isMe: boolean;
};

type SeasonPrizePopup = {
  week: string;
  place: number;
  prize: number;
};

type MissionItem = {
  id: string;
  title: string;
  description: string;
  goal: number;
  progress: number;
  reward: number;
  category: string;
  secret?: boolean;
  unlocked?: boolean;
  isCompleted: boolean;
  isClaimed: boolean;
};

type MissionsPayload = {
  daily: MissionItem[];
  weekly: MissionItem[];
  difficulty: number;
  dailyKey: string;
  weeklyKey: string;
};

type WithdrawalRequest = {
  amount: number;
  eurAmount: number;
  status: string;
  adminComment?: string;
  createdAt: number;
  reviewedAt?: number | null;
};

type AdminWithdrawalRequest = {
  userTelegramId: string;
  username: string;
  requestIndex: number;
  amount: number;
  eurAmount: number;
  status: string;
  adminComment: string;
  createdAt: number;
  reviewedAt: number | null;
  userStats: {
    balance: number;
    totalEarned: number;
    weeklyEarned: number;
    referralsCount: number;
    totalTaps: number;
    totalBoostsUsed: number;
    totalUpgradesBought: number;
    ownedPerksCount: number;
    achievementsCompleted: number;
    isSuspicious: boolean;
    suspiciousReasons: string[];
  };
};

type SuspiciousUser = {
  telegramId: string;
  username: string;
  balance: number;
  totalEarned: number;
  weeklyEarned: number;
  referralsCount: number;
  totalTaps: number;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  isFrozen: boolean;
  frozenReason: string;
};

const API_URL = 'https://onix-coin.onrender.com/api/coins';
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ONIX_EUR_PER_1000 = 0.68;
const DEFAULT_MIN_WITHDRAW_ONIX = 750000;
const ADMIN_TELEGRAM_ID = String(import.meta.env.VITE_ADMIN_TELEGRAM_ID || '');

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_tap',
    title: 'Первый тап',
    description: 'Сделайте первый тап по монете',
    reward: 500,
    goal: 1,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'taps_100',
    title: '100 тапов',
    description: 'Сделайте 100 тапов',
    reward: 2500,
    goal: 100,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'taps_1000',
    title: '1 000 тапов',
    description: 'Сделайте 1 000 тапов',
    reward: 10000,
    goal: 1000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'first_upgrade',
    title: 'Первое улучшение',
    description: 'Купите любое улучшение',
    reward: 2500,
    goal: 1,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'miner_level_5',
    title: 'Майнер ур. 5',
    description: 'Прокачайте майнер до 5 уровня',
    reward: 10000,
    goal: 5,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'first_boost',
    title: 'Первый буст',
    description: 'Активируйте любой временный буст',
    reward: 5000,
    goal: 1,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'first_offline_claim',
    title: 'Первый оффлайн-доход',
    description: 'Заберите оффлайн-доход майнера',
    reward: 5000,
    goal: 1,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'first_friend',
    title: 'Первый друг',
    description: 'Пригласите первого друга',
    reward: 25000,
    goal: 1,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'taps_10000',
    title: '10 000 тапов',
    description: 'Сделайте 10 000 тапов',
    reward: 50000,
    goal: 10000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'weekly_100k',
    title: '100 000 ONIX за неделю',
    description: 'Заработайте 100 000 ONIX за неделю',
    reward: 25000,
    goal: 100000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'all_perks',
    title: 'Коллекционер перков',
    description: 'Купите все постоянные перки',
    reward: 75000,
    goal: 4,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'rank_gold',
    title: 'Золотой ранг',
    description: 'Достигните Gold I',
    reward: 50000,
    goal: 750000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'rank_diamond',
    title: 'Diamond игрок',
    description: 'Достигните Diamond',
    reward: 250000,
    goal: 5000000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'friends_5',
    title: '5 друзей',
    description: 'Пригласите 5 друзей',
    reward: 100000,
    goal: 5,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'streak_7',
    title: '7 дней подряд',
    description: 'Дойдите до 7 дня daily streak',
    reward: 50000,
    goal: 7,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'taps_50000',
    title: '50 000 тапов',
    description: 'Сделайте 50 000 тапов',
    reward: 150000,
    goal: 50000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'taps_100000',
    title: '100 000 тапов',
    description: 'Сделайте 100 000 тапов',
    reward: 300000,
    goal: 100000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'earned_1m',
    title: 'Миллионер ONIX',
    description: 'Заработайте 1 000 000 ONIX всего',
    reward: 100000,
    goal: 1000000,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'friends_10',
    title: '10 друзей',
    description: 'Пригласите 10 друзей',
    reward: 200000,
    goal: 10,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'upgrade_master',
    title: 'Мастер апгрейдов',
    description: 'Купите 25 улучшений',
    reward: 100000,
    goal: 25,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'boost_master',
    title: 'Boost Master',
    description: 'Используйте 10 бустов',
    reward: 75000,
    goal: 10,
    progress: 0,
    isCompleted: false,
  },
  {
    id: 'offline_master',
    title: 'Оффлайн мастер',
    description: 'Заберите оффлайн-доход 10 раз',
    reward: 75000,
    goal: 10,
    progress: 0,
    isCompleted: false,
  },
];

function formatOnix(value: number) {
  return Number(value || 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
  });
}

function getTapUpgradeCost(tapLevel: number) {
  return Math.round(1000 * Math.pow(1.35, Number(tapLevel || 1) - 1));
}

function getMinerUpgradeCost(minerLevel: number) {
  return Math.round(2500 * Math.pow(1.38, Number(minerLevel || 1) - 1));
}

function getEnergyUpgradeCost(energyLevel: number) {
  return Math.round(1500 * Math.pow(1.25, Number(energyLevel || 1) - 1));
}

function getRechargeUpgradeCost(rechargeLevel: number) {
  return Math.round(1800 * Math.pow(1.28, Number(rechargeLevel || 1) - 1));
}

function getDailyReward(level: number) {
  return Math.min(15000 + Number(level || 1) * 500, 50000);
}

function getDailyStreakMultiplier(streakDay: number) {
  const day = Number(streakDay || 1);

  if (day >= 7) return 2;

  return 1 + (day - 1) * 0.1;
}

function getDailyRewardWithStreak(level: number, streakDay: number) {
  return Math.round(getDailyReward(level) * getDailyStreakMultiplier(streakDay));
}

function getTapBoostCost(tapPower: number) {
  return Math.max(2500, Math.round(Number(tapPower || 1) * 500 * 0.7));
}

function getMiningBoostCost(autoclickers: number) {
  return Math.max(2500, Math.round(Number(autoclickers || 0.5) * 900 * 0.7));
}


const RANKS = [
  { id: 'bronze_1', name: 'Bronze I', threshold: 0, bonus: 0 },
  { id: 'bronze_2', name: 'Bronze II', threshold: 25000, bonus: 2500 },
  { id: 'bronze_3', name: 'Bronze III', threshold: 75000, bonus: 7500 },
  { id: 'silver_1', name: 'Silver I', threshold: 150000, bonus: 15000 },
  { id: 'silver_2', name: 'Silver II', threshold: 300000, bonus: 30000 },
  { id: 'silver_3', name: 'Silver III', threshold: 500000, bonus: 50000 },
  { id: 'gold_1', name: 'Gold I', threshold: 750000, bonus: 75000 },
  { id: 'gold_2', name: 'Gold II', threshold: 1000000, bonus: 100000 },
  { id: 'gold_3', name: 'Gold III', threshold: 1500000, bonus: 150000 },
  { id: 'platinum', name: 'Platinum', threshold: 2500000, bonus: 250000 },
  { id: 'diamond', name: 'Diamond', threshold: 5000000, bonus: 500000 },
  { id: 'master', name: 'Master', threshold: 10000000, bonus: 1000000 },
  { id: 'legend', name: 'Legend', threshold: 25000000, bonus: 2500000 },
];

function getRankInfo(totalEarned: number) {
  const earned = Number(totalEarned || 0);
  let currentRank = RANKS[0];
  let nextRank: (typeof RANKS)[number] | null = null;

  for (let i = 0; i < RANKS.length; i += 1) {
    if (earned >= RANKS[i].threshold) {
      currentRank = RANKS[i];
      nextRank = RANKS[i + 1] || null;
    }
  }

  const currentThreshold = currentRank.threshold;
  const nextThreshold = nextRank ? nextRank.threshold : currentThreshold;
  const progressTotal = Math.max(1, nextThreshold - currentThreshold);
  const progressCurrent = Math.max(0, earned - currentThreshold);
  const progressPercent = nextRank
    ? Math.min(100, (progressCurrent / progressTotal) * 100)
    : 100;

  return {
    currentRank,
    nextRank,
    progressCurrent,
    progressTotal,
    progressPercent,
  };
}


const RANK_ICON_IMAGES: Record<string, string> = {
  novice: 'data:image/png;base64,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',
  bronze: 'data:image/png;base64,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',
  silver: 'data:image/png;base64,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',
  gold: 'data:image/png;base64,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',
  platinum: 'data:image/png;base64,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',
  diamond: 'data:image/png;base64,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',
  grandmaster: 'data:image/png;base64,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',
};

function getRankIconTier(rankId: string, rankName = '') {
  const id = String(rankId || '').toLowerCase();
  const name = String(rankName || '').toLowerCase();

  if (id.includes('legend') || id.includes('master') || name.includes('legend') || name.includes('master') || name.includes('grand') || name.includes('гранд')) {
    return 'grandmaster';
  }

  if (id.includes('diamond') || name.includes('diamond') || name.includes('алмаз')) {
    return 'diamond';
  }

  if (id.includes('platinum') || name.includes('platinum') || name.includes('платин')) {
    return 'platinum';
  }

  if (id.includes('gold') || name.includes('gold') || name.includes('золот')) {
    return 'gold';
  }

  if (id.includes('silver') || name.includes('silver') || name.includes('сереб')) {
    return 'silver';
  }

  if (id.includes('bronze_1') || name.includes('нович')) {
    return 'novice';
  }

  if (id.includes('bronze') || name.includes('bronze') || name.includes('бронз')) {
    return 'bronze';
  }

  return 'novice';
}

function RankIcon({
  rank,
  size = 'md',
}: {
  rank: { id?: string; name?: string };
  size?: 'sm' | 'md' | 'lg';
}) {
  const tier = getRankIconTier(rank?.id || '', rank?.name || '');

  return (
    <div className={`onix-rank-icon onix-rank-icon-${tier} onix-rank-icon-${size}`}>
      <img
        className="onix-rank-icon-image"
        src={RANK_ICON_IMAGES[tier] || RANK_ICON_IMAGES.novice}
        alt={rank?.name || 'Rank'}
        draggable={false}
      />
    </div>
  );
}




function getTelegramId() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return '';
  return tg.initDataUnsafe?.user?.id?.toString() || '';
}

function getTransactionIcon(type: string) {
  if (type.includes('daily')) return '🎁';
  if (type.includes('offline')) return '⛏️';
  if (type.includes('rank')) return '🏆';
  if (type.includes('referral')) return '👥';
  if (type.includes('task')) return '✅';
  if (type.includes('upgrade')) return '⬆️';
  if (type.includes('boost')) return '⚡';
  if (type.includes('perk')) return '🧩';
  if (type.includes('chest')) return '🎁';
  if (type.includes('mission')) return '📋';
  if (type.includes('promo')) return '🎟';
  if (type.includes('welcome')) return '🎁';
  if (type.includes('team')) return '👥';
  if (type.includes('withdrawal')) return '💸';
  if (type.includes('admin')) return '🛠️';

  return '🧾';
}

function formatTransactionTime(createdAt?: number) {
  if (!createdAt) return '';

  return new Date(createdAt).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeBoost(value: unknown): 'none' | 'tap' | 'mining' {
  const boost = String(value || 'none').trim();

  if (boost === 'tap') return 'tap';
  if (boost === 'mining' || boost === 'miner') return 'mining';

  return 'none';
}


type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error?.message || 'Unknown frontend error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const telegramId =
        window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || '';

      fetch(`${API_URL}/frontend-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegramId,
          message: error?.message || 'Unknown frontend error',
          stack: `${error?.stack || ''}\n${info?.componentStack || ''}`,
          appVersion: '1.0.0',
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
          <div className="w-full max-w-sm rounded-3xl border border-red-400/30 bg-[#111827] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-3xl">
              ⚠️
            </div>

            <h1 className="text-2xl font-bold text-white">
              Что-то пошло не так
            </h1>

            <p className="mt-3 text-sm text-gray-400">
              Ошибка уже сохранена в логах. Обновите приложение.
            </p>

            <p className="mt-2 break-words text-xs text-gray-600">
              {this.state.message}
            </p>

            <button
              onClick={() => window.location.reload()}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 font-bold text-black"
            >
              Обновить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


function App() {
  useEffect(() => {
    const updateViewportVars = () => {
      const viewportHeight = Math.floor(
        tg?.viewportHeight || window.visualViewport?.height || window.innerHeight
      );
      const stableViewportHeight = Math.floor(
        tg?.stableViewportHeight || viewportHeight
      );
      const windowHeight = Math.floor(window.innerHeight || viewportHeight);
      const viewportDiff = Math.max(0, windowHeight - viewportHeight);

      document.documentElement.style.setProperty('--oc-app-height', `${viewportHeight}px`);
      document.documentElement.style.setProperty('--oc-stable-height', `${stableViewportHeight}px`);
      document.documentElement.style.setProperty('--oc-window-height', `${windowHeight}px`);
      document.documentElement.style.setProperty('--oc-viewport-diff', `${viewportDiff}px`);
    };

    updateViewportVars();
    window.addEventListener('resize', updateViewportVars);
    window.visualViewport?.addEventListener('resize', updateViewportVars);
    tg?.onEvent?.('viewportChanged', updateViewportVars);

    return () => {
      window.removeEventListener('resize', updateViewportVars);
      window.visualViewport?.removeEventListener('resize', updateViewportVars);
      tg?.offEvent?.('viewportChanged', updateViewportVars);
    };
  }, []);

  const [balance, setBalance] = useState(0);
  const [economyConfig, setEconomyConfig] = useState<EconomyConfig>({
    onixEurPer1000: DEFAULT_ONIX_EUR_PER_1000,
    minWithdrawOnix: DEFAULT_MIN_WITHDRAW_ONIX,
    referralReward: 75000,
    referredUserReward: 15000,
    maxPaidReferralsPerDay: 10,
  });
  const [username, setUsername] = useState('Пользователь');
  const [selectedTitle, setSelectedTitle] = useState('ONIX Player');
  const [achievementCategory, setAchievementCategory] =
    useState<AchievementCategory>('all');
  const [weeklyEarned, setWeeklyEarned] = useState(0);
  const [currentUserPlace, setCurrentUserPlace] = useState<number | null>(null);
  const [energy, setEnergy] = useState(500);
  const [maxEnergy, setMaxEnergy] = useState(500);
  const [tapPower, setTapPower] = useState(1);
  const [energyRecharge, setEnergyRecharge] = useState(0.5);
  const [autoclickers, setAutoclickers] = useState(0.5);
  const [level, setLevel] = useState(1);
  const [totalEarned, setTotalEarned] = useState(0);
  const [activeTab, setActiveTab] = useState<Tab>('home');

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousBodyPosition = body.style.position;
    const previousBodyWidth = body.style.width;

    if (activeTab !== 'home') {
      html.classList.remove('onix-html-home-lock');
      body.classList.remove('onix-body-home-lock');
      return;
    }

    html.classList.add('onix-html-home-lock');
    body.classList.add('onix-body-home-lock');
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.position = 'fixed';
    body.style.width = '100%';

    const preventHomeScroll = (event: TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, .onix-nav')) return;
      event.preventDefault();
    };

    document.addEventListener('touchmove', preventHomeScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventHomeScroll);
      html.classList.remove('onix-html-home-lock');
      body.classList.remove('onix-body-home-lock');
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      body.style.position = previousBodyPosition;
      body.style.width = previousBodyWidth;
    };
  }, [activeTab]);
  const [boostSubTab, setBoostSubTab] = useState<BoostSubTab>('tapping');
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [isTapped, setIsTapped] = useState(false);
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingNumber[]>([]);

  const [activeBoost, setActiveBoost] = useState<'none' | 'tap' | 'mining'>(
    'none'
  );
  const [boostEndTime, setBoostEndTime] = useState(0);
  const [referralsCount, setReferralsCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [leaderboardWeek, setLeaderboardWeek] = useState('');
  const [seasonSecondsLeft, setSeasonSecondsLeft] = useState(0);
  const [referralModalVisible, setReferralModalVisible] = useState(false);
  const [copySuccessVisible, setCopySuccessVisible] = useState(false);
  const [referralLimit, setReferralLimit] = useState<ReferralLimit>({
    used: 0,
    max: 10,
    remaining: 10,
    resetAt: 0,
    secondsUntilReset: 0,
    isLimitReached: false,
  });
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [ownedPerks, setOwnedPerks] = useState<string[]>([]);
  const [perkLevels, setPerkLevels] = useState<Record<string, number>>({});
  const [lastChestReward, setLastChestReward] = useState('');
  const [dailyCooldown, setDailyCooldown] = useState(0);
  const [missions, setMissions] = useState<MissionsPayload>({
    daily: [],
    weekly: [],
    difficulty: 1,
    dailyKey: '',
    weeklyKey: '',
  });
  const [dailyStreak, setDailyStreak] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>('all');
  const [adminEconomyDashboard, setAdminEconomyDashboard] =
    useState<AdminEconomyDashboard | null>(null);
  const [adminEconomyVisible, setAdminEconomyVisible] = useState(false);
  const [adminSearchVisible, setAdminSearchVisible] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSearchResults, setAdminSearchResults] = useState<AdminUserSearchResult[]>([]);
  const [adminSelectedUser, setAdminSelectedUser] =
    useState<AdminUserProfile | null>(null);
  const [adminAdjustAmount, setAdminAdjustAmount] = useState('');
  const [adminActionReason, setAdminActionReason] = useState('');
  const [adminSecurityLogs, setAdminSecurityLogs] = useState<AdminSecurityLog[]>([]);
  const [adminSecurityLogsVisible, setAdminSecurityLogsVisible] = useState(false);
  const [admin2Visible, setAdmin2Visible] = useState(false);
  const [adminEconomyConfigDraft, setAdminEconomyConfigDraft] = useState<Record<string, string>>({});
  const [adminBroadcastMessage, setAdminBroadcastMessage] = useState('');
  const [adminBroadcastResult, setAdminBroadcastResult] = useState<any>(null);
  const [adminOperations, setAdminOperations] = useState<AdminOperationsPayload | null>(null);
  const [adminNoteText, setAdminNoteText] = useState('');
  const [appVersionInfo, setAppVersionInfo] = useState<any>(null);
  const [adminFrontendErrors, setAdminFrontendErrors] = useState<any[]>([]);
  const [launchChecklistVisible, setLaunchChecklistVisible] = useState(false);
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [promoModalVisible, setPromoModalVisible] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');


  useEffect(() => {
    const lock = activeTab === 'home';
    document.documentElement.classList.toggle('oc-lock-home-scroll', lock);
    document.body.classList.toggle('oc-lock-home-scroll', lock);
    return () => {
      document.documentElement.classList.remove('oc-lock-home-scroll');
      document.body.classList.remove('oc-lock-home-scroll');
    };
  }, [activeTab]);
  const [withdrawalCheck, setWithdrawalCheck] = useState('');
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>(ACHIEVEMENTS);
  const [channelJoined, setChannelJoined] = useState(false);

  const [tapLevel, setTapLevel] = useState(1);
  const [minerLevel, setMinerLevel] = useState(1);
  const [energyLevel, setEnergyLevel] = useState(1);
  const [rechargeLevel, setRechargeLevel] = useState(1);

  const [offlineRewardVisible, setOfflineRewardVisible] = useState(false);
  const [offlineRewardAmount, setOfflineRewardAmount] = useState(0);
  const [offlineRewardTime, setOfflineRewardTime] = useState('');
  const [isClaimingOfflineReward, setIsClaimingOfflineReward] = useState(false);
  const [rewardPopupItems, setRewardPopupItems] = useState<RewardPopupItem[]>([]);
  const [rewardPopupVisible, setRewardPopupVisible] = useState(false);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [seasonHistory, setSeasonHistory] = useState<SeasonHistoryItem[]>([]);
  const [teamLeaderboard, setTeamLeaderboard] = useState<TeamLeaderboardItem[]>([]);
  const [seasonPrizePopup, setSeasonPrizePopup] =
    useState<SeasonPrizePopup | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamSocialDashboard, setTeamSocialDashboard] =
    useState<TeamSocialDashboard | null>(null);
  const [friendLeaderboard, setFriendLeaderboard] = useState<FriendLeaderboardItem[]>([]);
  const [league, setLeague] = useState('Bronze');
  const [isWithdrawalLoading, setIsWithdrawalLoading] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [adminWithdrawals, setAdminWithdrawals] = useState<AdminWithdrawalRequest[]>([]);
  const [adminWithdrawalsVisible, setAdminWithdrawalsVisible] = useState(false);
  const [adminWithdrawalComment, setAdminWithdrawalComment] = useState('');
  const [suspiciousUsers, setSuspiciousUsers] = useState<SuspiciousUser[]>([]);
  const [suspiciousUsersVisible, setSuspiciousUsersVisible] = useState(false);

  const [totalTaps, setTotalTaps] = useState(0);
  const [totalBoostsUsed, setTotalBoostsUsed] = useState(0);
  const [totalUpgradesBought, setTotalUpgradesBought] = useState(0);
  const [offlineClaimsCount, setOfflineClaimsCount] = useState(0);
  const [adminPanelVisible, setAdminPanelVisible] = useState(false);
  const [adminPrizePreview, setAdminPrizePreview] =
    useState<AdminPrizePreviewResponse | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);

  useEffect(() => {
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';

    if (startParam.startsWith('team_')) {
      joinTeamByCode(startParam.replace('team_', ''));
    }
  }, []);

  useEffect(() => {
    const loadAppVersion = async () => {
      try {
        const response = await axios.get(`${API_URL}/version`);
        setAppVersionInfo(response.data);
      } catch {
        setAppVersionInfo({ version: '1.0.0' });
      }
    };

    try {
      WebApp.ready();
      WebApp.expand();
    } catch {}

    loadAppVersion();
  }, []);

  useEffect(() => {
    const loadEconomyConfig = async () => {
      try {
        const response = await axios.get(`${API_URL}/config`);

        setEconomyConfig({
          onixEurPer1000:
            Number(response.data.onixEurPer1000) || DEFAULT_ONIX_EUR_PER_1000,
          minWithdrawOnix:
            Number(response.data.minWithdrawOnix) || DEFAULT_MIN_WITHDRAW_ONIX,
          referralReward: Number(response.data.referralReward) || economyConfig.referralReward,
          referredUserReward: Number(response.data.referredUserReward) || 15000,
          maxPaidReferralsPerDay:
            Number(response.data.maxPaidReferralsPerDay) || 10,
        });
      } catch (error) {
        console.log('Ошибка загрузки конфига экономики:', error);
      }
    };

    loadEconomyConfig();
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const telegramId =
          window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || '';

        const startParam =
          window.Telegram?.WebApp?.initDataUnsafe?.start_param || null;

        await axios.post(`${API_URL}/create`, {
          telegramId,
          username:
            `${window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || ''} ${
              window.Telegram?.WebApp?.initDataUnsafe?.user?.last_name || ''
            }`.trim() || 'Пользователь',
          referredBy: startParam,
        });

        const response = await axios.get(`${API_URL}/${telegramId}`);
        const user = response.data;

        if (localStorage.getItem('channelJoined') === 'true') {
          setChannelJoined(true);
        }

        const savedCooldown = localStorage.getItem('dailyCooldownEnd');

        if (savedCooldown) {
          const diff = Number(savedCooldown) - Date.now();

          if (diff > 0) {
            setDailyCooldown(diff);
          } else {
            localStorage.removeItem('dailyCooldownEnd');
          }
        } else {
          const lastDaily = user.dailyRewardLastClaim || user.lastDailyRewardDate;

          if (lastDaily) {
            const lastClaim = new Date(lastDaily).getTime();
            const diff = DAY_MS - (Date.now() - lastClaim);

            if (diff > 0) {
              setDailyCooldown(diff);
              localStorage.setItem(
                'dailyCooldownEnd',
                (Date.now() + diff).toString()
              );
            }
          }
        }

        setBalance(user.balance || 0);
        setUsername(user.username || 'Пользователь');
        setWeeklyEarned(Number(user.weeklyEarned || 0));
        setEnergy(user.energy ?? 500);
        setMaxEnergy(user.maxEnergy ?? 500);
        setTapPower(user.tapPower ?? 1);
        setEnergyRecharge(user.energyRecharge ?? 0.5);
        setAutoclickers(user.autoclickers ?? 0.5);
        setTotalEarned(user.totalEarned || 0);
        setLevel(user.level || 1);
        setReferralsCount(user.referralsCount || 0);
        setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
        setCompletedTasks(user.completedTasks || []);
        setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
        setDailyStreak(Number(user.dailyStreak || 0));
        setTransactions(user.transactions || []);
        setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
        setActiveBoost(normalizeBoost(user.activeBoost));
        setBoostEndTime(Number(user.boostEndTime || 0));

        setTimeout(() => {
          const offlineIncome = Number(
            user.pendingOfflineIncome || user.lastOfflineIncome || 0
          );

          const offlineSeconds = Number(
            user.pendingOfflineSeconds || user.lastOfflineSeconds || 0
          );

          console.log('PENDING OFFLINE INCOME:', offlineIncome);
          console.log('PENDING OFFLINE SECONDS:', offlineSeconds);

          if (offlineIncome > 0) {
            setOfflineRewardAmount(offlineIncome);
            setOfflineRewardTime(
              offlineSeconds > 0 ? formatOfflineTime(offlineSeconds) : ''
            );
            setOfflineRewardVisible(true);
          }
        }, 1000);

        const oldRefs = Number(localStorage.getItem('knownReferrals') || 0);
        const newRefs = user.referralsCount || 0;

        if (newRefs > oldRefs) {
          showToast(
            `👥 По вашей ссылке перешёл ${
              user.lastReferralUsername || 'новый пользователь'
            }. Бонус +${formatOnix(
              economyConfig.referralReward
            )} ONIX придёт, когда друг сделает 100 тапов.`,
            'info'
          );
        }

        localStorage.setItem('knownReferrals', newRefs.toString());

        if (startParam && startParam.startsWith('team_')) {
          await joinTeamByCode(startParam.replace('team_', ''));
        }

        if (
          user.referredBy &&
          !localStorage.getItem(`referralWelcomeShown_${user.telegramId}`)
        ) {
          showToast(
            `🎁 Вы получили +${formatOnix(economyConfig.referredUserReward)} ONIX за вход по ссылке пользователя ${
              user.referredByUsername || 'друга'
            }!`
          );

          localStorage.setItem(`referralWelcomeShown_${user.telegramId}`, 'true');
        }

        setTapLevel(user.tapLevel || 1);
        setMinerLevel(user.minerLevel || 1);
        setEnergyLevel(user.energyLevel || 1);
        setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
        applyUserStats(user);
      } catch (error) {
        console.log('Ошибка загрузки пользователя:', error);
      } finally {
        setIsAppLoading(false);

        if (!localStorage.getItem('onixTutorialDone')) {
          setTutorialVisible(true);
        }
      }
    };

    loadUser();
  }, []);

  useEffect(() => {
    const loadSeasonHistory = async () => {
      try {
        const response = await axios.get(`${API_URL}/season-history`);

        setSeasonHistory(response.data.seasons || []);
      } catch (error) {
        console.log('Ошибка загрузки истории сезонов:', error);
      }
    };

    loadSeasonHistory();
  }, []);

  useEffect(() => {
    const loadTeamLeaderboard = async () => {
      try {
        const response = await axios.get(`${API_URL}/leaderboard/teams`);

        setTeamLeaderboard(response.data.teams || []);
      } catch (error) {
        console.log('Ошибка загрузки командного рейтинга:', error);
      }
    };

    loadTeamLeaderboard();
  }, []);

  useEffect(() => {
    const loadSeasonPrizePopup = async () => {
      const telegramId = getTelegramId();

      if (!telegramId) return;

      try {
        const response = await axios.post(`${API_URL}/season-prize-popup`, {
          telegramId,
        });

        if (response.data.prize) {
          setSeasonPrizePopup(response.data.prize);
        }
      } catch (error) {
        console.log('Ошибка загрузки сезонного popup:', error);
      }
    };

    loadSeasonPrizePopup();
  }, []);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        const telegramId = getTelegramId();

        const response = await axios.get(`${API_URL}/leaderboard/weekly`, {
          params: {
            telegramId,
          },
        });

        setLeaderboard(response.data.leaderboard || []);
        setLeaderboardWeek(response.data.week || '');
        setSeasonSecondsLeft(Number(response.data.secondsUntilSeasonEnd || 0));
        setCurrentUserPlace(response.data.currentUserPlace || null);
        setWeeklyEarned(Number(response.data.currentUserWeeklyEarned || weeklyEarned));
      } catch (error) {
        console.log('Ошибка загрузки лидерборда:', error);
      }
    };

    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (seasonSecondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSeasonSecondsLeft((prev) => {
        if (prev <= 1) return 0;

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [seasonSecondsLeft]);

  useEffect(() => {
    if (referralLimit.secondsUntilReset <= 0) return;

    const timer = setInterval(() => {
      setReferralLimit((prev) => {
        if (prev.secondsUntilReset <= 1) {
          return {
            ...prev,
            used: 0,
            remaining: prev.max,
            secondsUntilReset: 0,
            isLimitReached: false,
          };
        }

        return {
          ...prev,
          secondsUntilReset: prev.secondsUntilReset - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [referralLimit.secondsUntilReset]);

  useEffect(() => {
    if (dailyCooldown <= 0) return;

    const timer = setInterval(() => {
      setDailyCooldown((prev) => {
        if (prev <= 1000) {
          localStorage.removeItem('dailyCooldownEnd');
          clearInterval(timer);
          return 0;
        }

        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [dailyCooldown]);

  useEffect(() => {
    let isRequestRunning = false;

    const interval = setInterval(async () => {
      const telegramId = getTelegramId();

      const now = Date.now();
      const currentBoost = normalizeBoost(activeBoost);
      const currentBoostEndTime = Number(boostEndTime || 0);

      if (
        currentBoost !== 'none' &&
        currentBoostEndTime > 0 &&
        currentBoostEndTime <= now
      ) {
        setActiveBoost('none');
        setBoostEndTime(0);
      }

      if (!telegramId) {
        setEnergy((prev) => Math.min(maxEnergy, prev + energyRecharge));
        return;
      }

      if (Number(autoclickers || 0) <= 0) {
        setEnergy((prev) => Math.min(maxEnergy, prev + energyRecharge));
        return;
      }

      if (isRequestRunning) return;

      try {
        isRequestRunning = true;

        const response = await axios.post(`${API_URL}/mine-tick`, {
          telegramId,
        });

        const user = response.data.user;

        setBalance(user.balance || 0);
        setUsername(user.username || 'Пользователь');
        setWeeklyEarned(Number(user.weeklyEarned || 0));
        setEnergy(user.energy || 0);
        setMaxEnergy(user.maxEnergy ?? 500);
        setTapPower(user.tapPower ?? 1);
        setEnergyRecharge(user.energyRecharge ?? 0.5);
        setAutoclickers(user.autoclickers ?? 0.5);
        setTotalEarned(user.totalEarned || 0);
        setLevel(user.level || 1);
        setReferralsCount(user.referralsCount || 0);
        setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
        setCompletedTasks(user.completedTasks || []);
        setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
        setDailyStreak(Number(user.dailyStreak || 0));
        setTransactions(user.transactions || []);
        setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
        setActiveBoost(normalizeBoost(user.activeBoost));
        setBoostEndTime(Number(user.boostEndTime || 0));

        setTapLevel(user.tapLevel || 1);
        setMinerLevel(user.minerLevel || 1);
        setEnergyLevel(user.energyLevel || 1);
        setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
        applyUserStats(user);
      } catch (error) {
        console.log('Ошибка майнинга:', error);
      } finally {
        isRequestRunning = false;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [autoclickers, activeBoost, boostEndTime, maxEnergy, energyRecharge]);

  const handleTap = async (e: React.MouseEvent<HTMLElement>) => {
    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID');
      return;
    }

    if (energy <= 0) return;

    try {
      const rect = e.currentTarget.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const response = await axios.post(`${API_URL}/tap`, {
        telegramId,
      });

      const user = response.data.user;
      const points = response.data.points ?? user.tapPower ?? tapPower ?? 1;

      setBalance(user.balance || 0);
      setUsername(user.username || 'Пользователь');
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setEnergy(user.energy || 0);
      setMaxEnergy(user.maxEnergy ?? 500);
      setTapPower(user.tapPower ?? 1);
      setEnergyRecharge(user.energyRecharge ?? 0.5);
      setAutoclickers(user.autoclickers ?? 0.5);
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setReferralsCount(user.referralsCount || 0);
      setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
      setCompletedTasks(user.completedTasks || []);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setDailyStreak(Number(user.dailyStreak || 0));
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setActiveBoost(normalizeBoost(user.activeBoost));
      setBoostEndTime(Number(user.boostEndTime || 0));

      setTapLevel(user.tapLevel || 1);
      setMinerLevel(user.minerLevel || 1);
      setEnergyLevel(user.energyLevel || 1);
      setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
      showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);

      const newNum: FloatingNumber = {
        id: Date.now(),
        x,
        y,
        value: points,
      };

      setFloatingNumbers((prev) => [...prev, newNum]);

      setTimeout(() => {
        setFloatingNumbers((prev) => prev.filter((n) => n.id !== newNum.id));
      }, 700);

      setIsTapped(true);
      setTimeout(() => setIsTapped(false), 60);

      try {
        WebApp.HapticFeedback?.impactOccurred('medium');
      } catch {}
    } catch (error: any) {
      if (error?.response?.status === 429) {
        console.log('Слишком много тапов');
        return;
      }

      if (error?.response?.status === 400) {
        console.log(error?.response?.data?.message || 'Ошибка тапа');
        return;
      }

      console.log('Ошибка тапа:', error);
    }
  };


  const syncGrowthUser = (user: any, fallbackData: any = {}) => {
    if (!user) return;

    setBalance(user.balance || 0);
    setWeeklyEarned(Number(user.weeklyEarned || 0));
    setTotalEarned(user.totalEarned || 0);
    setLevel(user.level || 1);
    setTransactions(user.transactions || []);
    setAchievements(user.achievements || fallbackData.achievements || ACHIEVEMENTS);
    setOwnedPerks(user.ownedPerks || []);
    setPerkLevels(normalizePerkLevels(user.perkLevels));
    applyUserStats(user);
  };

  const claimWelcomeBonus = async () => {
    const telegramId = getTelegramId();

    try {
      const response = await axios.post(`${API_URL}/claim-welcome-bonus`, {
        telegramId,
      });

      syncGrowthUser(response.data.user, response.data);
      showRewardPopupFromResponse(response.data);
      showToast(`🎁 Welcome bonus: +${formatOnix(response.data.reward)} ONIX`, 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Welcome bonus недоступен', 'error');
    }
  };

  const applyPromoCode = async () => {
    const telegramId = getTelegramId();

    try {
      const response = await axios.post(`${API_URL}/apply-promo`, {
        telegramId,
        code: promoCodeInput,
      });

      syncGrowthUser(response.data.user, response.data);
      showRewardPopupFromResponse(response.data);
      setPromoCodeInput('');
      setPromoModalVisible(false);
      showToast(
        `🎟 Промокод активирован: +${formatOnix(response.data.promo.reward)} ONIX`,
        'success'
      );
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось активировать промокод', 'error');
    }
  };

  const refreshAfterAction = async () => {
    try {
      await loadMissions();
    } catch {}
  };

  const buyUpgrade = async (type: 'tap' | 'energy' | 'recharge' | 'miner') => {
    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/buy-upgrade`, {
        telegramId,
        type,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setUsername(user.username || 'Пользователь');
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setEnergy(user.energy || 0);
      setMaxEnergy(user.maxEnergy ?? 500);
      setTapPower(user.tapPower ?? 1);
      setEnergyRecharge(user.energyRecharge ?? 0.5);
      setAutoclickers(user.autoclickers ?? 0.5);
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setReferralsCount(user.referralsCount || 0);
      setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
      setCompletedTasks(user.completedTasks || []);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setDailyStreak(Number(user.dailyStreak || 0));
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setActiveBoost(normalizeBoost(user.activeBoost));
      setBoostEndTime(Number(user.boostEndTime || 0));

      setTapLevel(user.tapLevel || 1);
      setMinerLevel(user.minerLevel || 1);
      setEnergyLevel(user.energyLevel || 1);
      setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
      showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);
      refreshAfterAction();

      try {
        WebApp.HapticFeedback?.notificationOccurred('success');
      } catch {}
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось купить улучшение');
    }
  };


  const openChest = async () => {
    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID', 'error');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/open-chest`, {
        telegramId,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setLastChestReward(user.chestStats?.lastReward || '');

      showToast(
        `🎁 ${response.data.chest.rewardTitle}: +${formatOnix(
          response.data.chest.rewardAmount
        )} ONIX`,
        'success'
      );

      showRewardPopupFromResponse(response.data);
      refreshAfterAction();
      refreshAfterAction();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось открыть сундук', 'error');
    }
  };

  const buyPerk = async (perkId: string) => {
    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/buy-perk`, {
        telegramId,
        perkId,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setUsername(user.username || 'Пользователь');
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setEnergy(user.energy || 0);
      setMaxEnergy(user.maxEnergy ?? 500);
      setTapPower(user.tapPower ?? 1);
      setEnergyRecharge(user.energyRecharge ?? 0.5);
      setAutoclickers(user.autoclickers ?? 0.5);
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setReferralsCount(user.referralsCount || 0);
      setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
      setCompletedTasks(user.completedTasks || []);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setDailyStreak(Number(user.dailyStreak || 0));
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setActiveBoost(normalizeBoost(user.activeBoost));
      setBoostEndTime(Number(user.boostEndTime || 0));

      setTapLevel(user.tapLevel || 1);
      setMinerLevel(user.minerLevel || 1);
      setEnergyLevel(user.energyLevel || 1);
      setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);

      try {
        WebApp.HapticFeedback?.notificationOccurred('success');
      } catch {}
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось купить перк');
    }
  };

  const activateBoost = async (
    type: 'tap' | 'mining',
    _minutes: number,
    _cost: number
  ) => {
    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID');
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/activate-boost`, {
        telegramId,
        type,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setUsername(user.username || 'Пользователь');
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setEnergy(user.energy || 0);
      setMaxEnergy(user.maxEnergy ?? 500);
      setTapPower(user.tapPower ?? 1);
      setEnergyRecharge(user.energyRecharge ?? 0.5);
      setAutoclickers(user.autoclickers ?? 0.5);
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setReferralsCount(user.referralsCount || 0);
      setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
      setCompletedTasks(user.completedTasks || []);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setDailyStreak(Number(user.dailyStreak || 0));
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setActiveBoost(normalizeBoost(user.activeBoost));
      setBoostEndTime(Number(user.boostEndTime || 0));

      setTapLevel(user.tapLevel || 1);
      setMinerLevel(user.minerLevel || 1);
      setEnergyLevel(user.energyLevel || 1);
      setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
      showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);
      refreshAfterAction();

      try {
        WebApp.HapticFeedback?.notificationOccurred('success');
      } catch {}

      showToast(`⚡ ${type === 'tap' ? 'Тап' : 'Майнинг'} ×2 активирован!`);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось активировать буст');
    }
  };

  const getReferralLink = () => {
    const telegramId = getTelegramId();

    return telegramId
      ? `https://t.me/coinonix_bot/onix?startapp=${telegramId}`
      : 'https://t.me/coinonix_bot/onix';
  };

  const getReferralShareText = () =>
    'Присоединяйся к $ONIX coin ⚡ Получи стартовый бонус 15 000 ONIX!';

  const showCopySuccess = () => {
    setCopySuccessVisible(true);

    setTimeout(() => {
      setCopySuccessVisible(false);
    }, 1600);
  };

  const copyReferralLink = async () => {
    const link = getReferralLink();

    try {
      await navigator.clipboard.writeText(link);
      showCopySuccess();
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      showCopySuccess();
    }
  };

  const shareReferralLink = () => {
    const link = getReferralLink();
    const text = getReferralShareText();

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      link
    )}&text=${encodeURIComponent(text)}`;

    try {
      WebApp.openTelegramLink(shareUrl);
    } catch {
      window.open(shareUrl, '_blank');
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}ч ${minutes}м ${seconds}с`;
  };

  const formatOfflineTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }

    if (minutes > 0) {
      return `${minutes}м ${secs}с`;
    }

    return `${secs}с`;
  };

  const claimOfflineReward = async () => {
    if (isClaimingOfflineReward) return;

    const telegramId = getTelegramId();

    if (!telegramId) {
      showToast('Не удалось получить Telegram ID');
      return;
    }

    try {
      setIsClaimingOfflineReward(true);

      const response = await axios.post(`${API_URL}/claim-offline-income`, {
        telegramId,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setUsername(user.username || 'Пользователь');
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setEnergy(user.energy || 0);
      setMaxEnergy(user.maxEnergy ?? 500);
      setTapPower(user.tapPower ?? 1);
      setEnergyRecharge(user.energyRecharge ?? 0.5);
      setAutoclickers(user.autoclickers ?? 0.5);
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setReferralsCount(user.referralsCount || 0);
      setReferralLimit(user.referralLimit || response.data.referralLimit || referralLimit);
      setCompletedTasks(user.completedTasks || []);
      setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
      setDailyStreak(Number(user.dailyStreak || 0));
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      setActiveBoost(normalizeBoost(user.activeBoost));
      setBoostEndTime(Number(user.boostEndTime || 0));

      setTapLevel(user.tapLevel || 1);
      setMinerLevel(user.minerLevel || 1);
      setEnergyLevel(user.energyLevel || 1);
      setRechargeLevel(user.rechargeLevel || 1);
      applyUserStats(user);
      showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);

      setOfflineRewardVisible(false);
      setOfflineRewardAmount(0);
      setOfflineRewardTime('');

      try {
        WebApp.HapticFeedback?.notificationOccurred('success');
      } catch {}
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось забрать доход майнера');
    } finally {
      setIsClaimingOfflineReward(false);
    }
  };


  const applyUserStats = (user: any) => {
    setTotalTaps(Number(user.totalTaps || 0));
    setTotalBoostsUsed(Number(user.totalBoostsUsed || 0));
    setTotalUpgradesBought(Number(user.totalUpgradesBought || 0));
    setOfflineClaimsCount(Number(user.offlineClaimsCount || 0));
    setWithdrawalRequests(user.withdrawalRequests || []);
    setSelectedTitle(user.selectedTitle || 'ONIX Player');
    setPerkLevels(normalizePerkLevels(user.perkLevels));
    setLastChestReward(user.chestStats?.lastReward || '');
    setTeamName(user.teamName || '');
    setTeamNameInput((currentValue) => currentValue || user.teamName || '');
    setLeague(user.league || 'Bronze');
    if (user.missions) setMissions(user.missions);
  };

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    const id = Date.now() + Math.random();

    setToastMessages((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToastMessages((prev) => prev.filter((toast) => toast.id !== id));
    }, 2800);
  };

  const showReferralBonusPaidToast = (data: any) => {
    const referralBonus = data?.referralBonusPaid;

    if (!referralBonus || !Number(referralBonus.reward || 0)) return;

    showToast(
      `👥 Реферальный бонус начислен пригласившему: +${formatOnix(
        referralBonus.reward
      )} ONIX`,
      'success'
    );
  };

  const showRewardPopupFromResponse = (data: any) => {
    const items: RewardPopupItem[] = [];

    const rankBonuses = data?.rankBonuses || data?.user?.rankBonuses || [];
    const achievementBonuses =
      data?.achievementBonuses || data?.user?.achievementBonuses || [];

    if (Array.isArray(rankBonuses)) {
      rankBonuses.forEach((bonus: { name?: string; bonus?: number }) => {
        if (Number(bonus.bonus || 0) > 0) {
          items.push({
            icon: '🏆',
            title: `Новый ранг: ${bonus.name || 'Ранг'}`,
            amount: Number(bonus.bonus || 0),
          });
        }
      });
    }

    if (Array.isArray(achievementBonuses)) {
      achievementBonuses.forEach(
        (achievement: { title?: string; reward?: number }) => {
          if (Number(achievement.reward || 0) > 0) {
            items.push({
              icon: '✅',
              title: `Достижение: ${achievement.title || 'Выполнено'}`,
              amount: Number(achievement.reward || 0),
            });
          }
        }
      );
    }

    if (items.length > 0) {
      setRewardPopupItems(items);
      setRewardPopupVisible(true);

      try {
        WebApp.HapticFeedback?.notificationOccurred('success');
      } catch {}
    }
  };


  const isAdmin = () => {
    const telegramId = getTelegramId();

    return Boolean(ADMIN_TELEGRAM_ID && telegramId === ADMIN_TELEGRAM_ID);
  };

  const loadAdminPrizePreview = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-weekly-prize-preview`, {
        params: {
          telegramId,
        },
      });

      setAdminPrizePreview(response.data);
      setAdminPanelVisible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить preview');
    } finally {
      setIsAdminLoading(false);
    }
  };


  const loadTeamSocialDashboard = async () => {
    const telegramId = getTelegramId();

    if (!telegramId) return;

    try {
      const response = await axios.get(`${API_URL}/team-dashboard/${telegramId}`);
      setTeamSocialDashboard(response.data);
    } catch (error) {
      console.log('Ошибка загрузки команды:', error);
    }
  };

  const loadFriendLeaderboard = async () => {
    const telegramId = getTelegramId();

    if (!telegramId) return;

    try {
      const response = await axios.get(`${API_URL}/friends-leaderboard/${telegramId}`);
      setFriendLeaderboard(response.data.friends || []);
    } catch (error) {
      console.log('Ошибка загрузки рейтинга друзей:', error);
    }
  };

  const getTeamInviteLink = () => {
    const teamCode = teamSocialDashboard?.team?.teamCode;

    if (!teamCode) return 'https://t.me/coinonix_bot/onix';

    return `https://t.me/coinonix_bot/onix?startapp=team_${teamCode}`;
  };

  const shareTeamInviteLink = () => {
    const link = getTeamInviteLink();
    const text = `Вступай в мою команду ${teamName || 'ONIX'} в ONIX COIN ⚡`;

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      link
    )}&text=${encodeURIComponent(text)}`;

    try {
      WebApp.openTelegramLink(shareUrl);
    } catch {
      window.open(shareUrl, '_blank');
    }
  };

  const joinTeamByCode = async (teamCode: string) => {
    const telegramId = getTelegramId();

    if (!telegramId || !teamCode) return;

    try {
      const response = await axios.post(`${API_URL}/join-team`, {
        telegramId,
        teamCode,
      });

      const user = response.data.user;

      setTeamName(user.teamName || '');
      setTeamNameInput(user.teamName || '');
      setTeamSocialDashboard({
        team: response.data.team,
        teamMissions: response.data.teamMissions || [],
        teamPrize: 0,
        week: '',
      });

      showToast(`👥 Вы вступили в команду ${user.teamName}`, 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось вступить в команду', 'error');
    }
  };

  const claimTeamMission = async (mission: TeamMissionItem) => {
    const telegramId = getTelegramId();

    if (!mission.isCompleted || mission.isClaimed) return;

    try {
      const response = await axios.post(`${API_URL}/claim-team-mission`, {
        telegramId,
        missionId: mission.id,
      });

      const user = response.data.user;

      syncGrowthUser(user, response.data);
      showRewardPopupFromResponse(response.data);
      showToast(`✅ Командная миссия: +${formatOnix(response.data.reward.amount)} ONIX`, 'success');
      await loadTeamSocialDashboard();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось забрать награду', 'error');
    }
  };

  const claimTeamPrize = async () => {
    const telegramId = getTelegramId();

    try {
      const response = await axios.post(`${API_URL}/claim-team-prize`, {
        telegramId,
      });

      syncGrowthUser(response.data.user, response.data);
      showRewardPopupFromResponse(response.data);
      showToast(`🏆 Командный приз: +${formatOnix(response.data.prize)} ONIX`, 'success');
      await loadTeamSocialDashboard();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось забрать командный приз', 'error');
    }
  };

  const loadMissions = async () => {
    const telegramId = getTelegramId();

    if (!telegramId) return;

    try {
      const response = await axios.get(`${API_URL}/missions/${telegramId}`);
      setMissions(response.data);
    } catch (error) {
      console.log('Ошибка загрузки миссий:', error);
    }
  };

  const claimMission = async (mission: MissionItem, missionType: 'daily' | 'weekly') => {
    const telegramId = getTelegramId();

    if (!mission.isCompleted || mission.isClaimed) return;

    try {
      const response = await axios.post(`${API_URL}/claim-mission`, {
        telegramId,
        missionId: mission.id,
        missionType,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setWeeklyEarned(Number(user.weeklyEarned || 0));
      setTotalEarned(user.totalEarned || 0);
      setLevel(user.level || 1);
      setTransactions(user.transactions || []);
      setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
      applyUserStats(user);
      setMissions(response.data.missions || user.missions || { daily: [], weekly: [], difficulty: 1, dailyKey: '', weeklyKey: '' });

      showToast(`✅ Миссия выполнена: +${formatOnix(response.data.missionReward.reward)} ONIX`, 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось забрать миссию', 'error');
    }
  };

  const searchAdminUsers = async () => {
    const telegramId = getTelegramId();

    if (!adminSearchQuery.trim()) {
      setAdminSearchResults([]);
      return;
    }

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-search-users`, {
        params: {
          telegramId,
          query: adminSearchQuery.trim(),
        },
      });

      setAdminSearchResults(response.data.users || []);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось найти пользователей', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadAdminUserProfile = async (targetTelegramId: string) => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-user-profile/${targetTelegramId}`, {
        params: {
          telegramId,
        },
      });

      setAdminSelectedUser(response.data.user);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить профиль', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const adjustAdminUserBalance = async () => {
    const telegramId = getTelegramId();

    if (!adminSelectedUser) return;

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-adjust-balance`, {
        telegramId,
        targetTelegramId: adminSelectedUser.telegramId,
        amount: Number(adminAdjustAmount),
        reason: adminActionReason,
      });

      showToast('✅ Баланс обновлён', 'success');
      setAdminAdjustAmount('');
      setAdminActionReason('');
      await loadAdminUserProfile(response.data.user.telegramId);
      await searchAdminUsers();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось изменить баланс', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const toggleAdminUserBan = async () => {
    const telegramId = getTelegramId();

    if (!adminSelectedUser) return;

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-ban-user`, {
        telegramId,
        targetTelegramId: adminSelectedUser.telegramId,
        ban: !adminSelectedUser.isFrozen,
        reason: adminActionReason || 'Решение администратора',
      });

      showToast(
        response.data.user.isFrozen ? '🚫 Пользователь заблокирован' : '✅ Пользователь разблокирован',
        'success'
      );
      setAdminActionReason('');
      await loadAdminUserProfile(response.data.user.telegramId);
      await searchAdminUsers();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось изменить статус', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadAdminSecurityLogs = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-security-logs`, {
        params: {
          telegramId,
        },
      });

      setAdminSecurityLogs(response.data.logs || []);
      setAdminSecurityLogsVisible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить логи', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };



  const downloadMongoBackup = () => {
    const telegramId = getTelegramId();
    const url = `${API_URL}/admin-backup?telegramId=${encodeURIComponent(telegramId)}`;

    window.open(url, '_blank');
  };

  const loadAdminFrontendErrors = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-frontend-errors`, {
        params: { telegramId },
      });

      setAdminFrontendErrors(response.data.logs || []);
      showToast('✅ Frontend errors обновлены', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить frontend errors', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const openAdmin2Panel = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const [configResponse, operationsResponse] = await Promise.all([
        axios.get(`${API_URL}/admin-economy-config`, {
          params: { telegramId },
        }),
        axios.get(`${API_URL}/admin-operations`, {
          params: { telegramId },
        }),
      ]);

      const config = configResponse.data.config || {};

      setAdminEconomyConfigDraft({
        ONIX_EUR_PER_1000: String(config.onixEurPer1000 || ''),
        MIN_WITHDRAW_ONIX: String(config.minWithdrawOnix || ''),
        REFERRAL_REWARD: String(config.referralReward || ''),
        REFERRED_USER_REWARD: String(config.referredUserReward || ''),
        WELCOME_BONUS: String(config.welcomeBonus || ''),
        CHEST_COST: String(config.chestCost || ''),
        MAX_PAID_REFERRALS_PER_DAY: String(config.maxPaidReferralsPerDay || ''),
        MAX_PAID_REFERRALS_PER_HOUR: String(config.maxPaidReferralsPerHour || ''),
      });

      setAdminOperations(operationsResponse.data);
      setAdmin2Visible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось открыть админку 2.0', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const saveAdminEconomyConfig = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-economy-config`, {
        telegramId,
        updates: adminEconomyConfigDraft,
      });

      showToast('✅ Economy config обновлён', 'success');
      setAdminEconomyConfigDraft((current) => ({
        ...current,
        ONIX_EUR_PER_1000: String(response.data.config.onixEurPer1000 || current.ONIX_EUR_PER_1000),
        MIN_WITHDRAW_ONIX: String(response.data.config.minWithdrawOnix || current.MIN_WITHDRAW_ONIX),
        REFERRAL_REWARD: String(response.data.config.referralReward || current.REFERRAL_REWARD),
        REFERRED_USER_REWARD: String(response.data.config.referredUserReward || current.REFERRED_USER_REWARD),
        WELCOME_BONUS: String(response.data.config.welcomeBonus || current.WELCOME_BONUS),
        CHEST_COST: String(response.data.config.chestCost || current.CHEST_COST),
      }));
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось сохранить config', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const sendAdminBroadcast = async (dryRun = false) => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-broadcast`, {
        telegramId,
        message: adminBroadcastMessage,
        dryRun,
      });

      setAdminBroadcastResult(response.data);
      showToast(
        dryRun
          ? `👀 Получателей: ${response.data.recipients}`
          : `✅ Отправлено: ${response.data.sent}, ошибок: ${response.data.failed}`,
        'success'
      );
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось выполнить рассылку', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const downloadUsersCsv = () => {
    const telegramId = getTelegramId();
    const url = `${API_URL}/admin-export-users.csv?telegramId=${encodeURIComponent(telegramId)}

/* Step 27: hard fix home scroll, header edges and notification layers */
html,
body {
  overscroll-behavior: none;
}

.onix-toast-layer {
  top: calc(70px + env(safe-area-inset-top)) !important;
  z-index: 260 !important;
  pointer-events: none;
}

.onix-toast-layer > * {
  pointer-events: auto;
}

.onix-home-locked {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  min-height: 100dvh !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  padding-bottom: 0 !important;
  overscroll-behavior: none !important;
}

.onix-home-locked * {
  overscroll-behavior: none !important;
}

.onix-home-locked .onix-header {
  position: relative !important;
  top: auto !important;
  left: auto !important;
  right: auto !important;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  outline: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  overflow: visible !important;
}

.onix-home-locked .onix-header::before,
.onix-home-locked .onix-header::after {
  display: none !important;
  content: none !important;
}

.onix-home-locked .onix-island-header {
  width: min(74vw, 292px) !important;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  margin: 0 auto !important;
  padding: 12px 18px 10px !important;
  border-radius: 0 0 28px 28px !important;
  border-top: 0 !important;
  border-left: 1px solid rgba(136, 92, 246, 0.30) !important;
  border-right: 1px solid rgba(136, 92, 246, 0.30) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.30) !important;
  box-shadow:
    0 14px 30px rgba(0,0,0,0.34),
    inset 0 0 22px rgba(136, 92, 246, 0.07) !important;
}

.onix-home-locked .onix-island-header::before,
.onix-home-locked .onix-island-header::after {
  display: none !important;
  content: none !important;
}

.onix-home-locked .onix-island-logo {
  width: 24px !important;
  height: 24px !important;
}

.onix-home-locked .onix-island-title {
  font-size: clamp(1.45rem, 5.5vw, 1.9rem) !important;
}

.onix-home-locked .onix-home-screen {
  position: relative !important;
  height: calc(100dvh - 64px) !important;
  min-height: 0 !important;
  max-height: calc(100dvh - 64px) !important;
  margin-top: 16px !important;
  padding: 0 14px calc(120px + env(safe-area-inset-bottom)) !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
}

.onix-home-locked .onix-home-hero-card {
  flex: 0 0 auto !important;
  min-height: 218px !important;
  max-height: 228px !important;
  padding: 18px 16px 16px !important;
  border-radius: 28px !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-balance-row {
  margin-top: 12px !important;
}

.onix-home-locked .onix-home-balance-value {
  margin-top: 12px !important;
  font-size: clamp(2.45rem, 11.7vw, 3.85rem) !important;
  line-height: 0.95 !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  flex: 0 0 auto !important;
  margin-top: 18px !important;
  width: min(61vw, 248px) !important;
  height: min(61vw, 248px) !important;
}

.onix-home-locked .onix-home-energy-block {
  flex: 0 0 auto !important;
  margin-top: 8px !important;
  padding: 0 2px 0 !important;
}

.onix-home-locked .onix-home-energy-text {
  font-size: 11px !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 6px !important;
  height: 8px !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 10px !important;
  min-height: 50px !important;
}

.onix-home-locked .onix-nav {
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
  z-index: 220 !important;
}

.onix-home-locked .onix-floating-number {
  z-index: 240 !important;
}

@media (max-height: 760px) {
  .onix-home-locked .onix-home-screen {
    margin-top: 14px !important;
    padding-bottom: calc(114px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 202px !important;
    max-height: 212px !important;
    padding: 16px 15px 14px !important;
  }

  .onix-home-locked .onix-home-balance-value {
    font-size: clamp(2.25rem, 11vw, 3.55rem) !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 14px !important;
    width: min(58vw, 235px) !important;
    height: min(58vw, 235px) !important;
  }

  .onix-home-locked .onix-home-energy-block {
    margin-top: 6px !important;
  }

  .onix-home-locked .onix-home-tap-button {
    min-height: 48px !important;
  }
}

/* Step 28: hard clean home header, scroll and overlay behavior */
html.onix-html-home-lock,
body.onix-body-home-lock {
  overflow: hidden !important;
  overscroll-behavior: none !important;
  touch-action: none !important;
}

body.onix-body-home-lock {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100dvh !important;
}

.onix-home-locked {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  min-height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
  padding-bottom: 0 !important;
}

.onix-home-locked .onix-header,
.onix-home-locked .onix-header::before,
.onix-home-locked .onix-header::after,
.onix-home-locked .onix-island-header,
.onix-home-locked .onix-island-header::before,
.onix-home-locked .onix-island-header::after {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  content: none !important;
  border: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}

.onix-clean-header-wrap {
  position: relative !important;
  z-index: 80 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  height: 70px !important;
  min-height: 70px !important;
  margin: -8px 0 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-clean-header-wrap::before,
.onix-clean-header-wrap::after {
  display: none !important;
  content: none !important;
}

.onix-clean-island {
  width: min(72vw, 286px) !important;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  margin: 0 auto !important;
  padding: 13px 18px 10px !important;
  border-radius: 0 0 28px 28px !important;
  border-left: 1px solid rgba(136, 92, 246, 0.32) !important;
  border-right: 1px solid rgba(136, 92, 246, 0.32) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.32) !important;
  background:
    radial-gradient(circle at 20% 0%, rgba(6, 182, 212, 0.18), transparent 36%),
    radial-gradient(circle at 78% 0%, rgba(168, 85, 247, 0.20), transparent 38%),
    linear-gradient(180deg, rgba(8, 15, 23, 0.98), rgba(16, 18, 40, 0.95)) !important;
  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.30),
    inset 0 0 22px rgba(136, 92, 246, 0.08) !important;
  overflow: hidden !important;
}

.onix-clean-island::before,
.onix-clean-island::after {
  display: none !important;
  content: none !important;
}

.onix-clean-island-logo {
  width: 24px !important;
  height: 24px !important;
  object-fit: contain !important;
  filter: drop-shadow(0 0 9px rgba(0, 229, 255, 0.55)) drop-shadow(0 0 14px rgba(136, 92, 246, 0.48));
}

.onix-clean-island-title {
  margin: 0 !important;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif !important;
  font-size: clamp(1.42rem, 5.4vw, 1.86rem) !important;
  line-height: 0.9 !important;
  font-weight: 900 !important;
  letter-spacing: 0.045em !important;
  color: #fff !important;
  white-space: nowrap !important;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.36) !important;
}

.onix-home-locked .onix-home-screen {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  height: calc(100dvh - 70px) !important;
  min-height: 0 !important;
  max-height: calc(100dvh - 70px) !important;
  margin: 10px 0 0 !important;
  padding: 0 14px calc(118px + env(safe-area-inset-bottom)) !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

.onix-home-locked .onix-home-hero-card {
  flex: 0 0 auto !important;
  width: 100% !important;
  min-height: 214px !important;
  max-height: 222px !important;
  padding: 16px 15px 14px !important;
  margin: 0 !important;
}

.onix-home-locked .onix-home-balance-row {
  margin-top: 12px !important;
}

.onix-home-locked .onix-home-balance-value {
  margin-top: 12px !important;
  font-size: clamp(2.35rem, 11.2vw, 3.7rem) !important;
  line-height: 0.96 !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  flex: 0 0 auto !important;
  margin-top: 16px !important;
  width: min(60vw, 242px) !important;
  height: min(60vw, 242px) !important;
}

.onix-home-locked .onix-home-energy-block {
  flex: 0 0 auto !important;
  width: 100% !important;
  margin-top: 7px !important;
  padding: 0 2px 0 !important;
}

.onix-home-locked .onix-home-energy-text {
  font-size: 11px !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 6px !important;
  height: 8px !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 10px !important;
  min-height: 50px !important;
}

.onix-home-locked .onix-nav {
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
  z-index: 500 !important;
}

.onix-toast-layer {
  top: calc(78px + env(safe-area-inset-top)) !important;
  bottom: auto !important;
  z-index: 10000 !important;
  pointer-events: none !important;
}

.onix-toast-layer > * {
  pointer-events: auto !important;
}

.onix-modal-layer {
  z-index: 10001 !important;
  align-items: center !important;
  padding-bottom: calc(110px + env(safe-area-inset-bottom)) !important;
}

@media (max-height: 760px) {
  .onix-clean-header-wrap {
    height: 64px !important;
    min-height: 64px !important;
  }

  .onix-clean-island {
    height: 58px !important;
    min-height: 60px !important;
    max-height: 58px !important;
    padding-top: 11px !important;
  }

  .onix-clean-island-title {
    font-size: 1.34rem !important;
  }

  .onix-home-locked .onix-home-screen {
    height: calc(100dvh - 64px) !important;
    max-height: calc(100dvh - 64px) !important;
    margin-top: 8px !important;
    padding-bottom: calc(112px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 202px !important;
    max-height: 210px !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 12px !important;
    width: min(57vw, 232px) !important;
    height: min(57vw, 232px) !important;
  }
}

/* Step 29: repair compact header after hard lock */
.onix-clean-header-wrap,
.onix-clean-island,
.onix-clean-island-logo,
.onix-clean-island-title,
.onix-home-locked .onix-clean-header-wrap,
.onix-home-locked .onix-clean-island,
.onix-home-locked .onix-clean-island-logo,
.onix-home-locked .onix-clean-island-title {
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 0 !important;
  max-height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
}

.onix-mini-top {
  position: relative !important;
  z-index: 90 !important;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  margin: -8px 0 0 !important;
  padding: 0 !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: center !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-mini-top::before,
.onix-mini-top::after {
  display: none !important;
  content: none !important;
}

.onix-mini-island {
  width: min(72vw, 286px) !important;
  height: 62px !important;
  min-height: 62px !important;
  max-height: 62px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  padding: 15px 18px 10px !important;
  margin: 0 auto !important;
  border-radius: 0 0 28px 28px !important;
  border-left: 1px solid rgba(136, 92, 246, 0.32) !important;
  border-right: 1px solid rgba(136, 92, 246, 0.32) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.32) !important;
  background:
    radial-gradient(circle at 22% 0%, rgba(6, 182, 212, 0.18), transparent 38%),
    radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.22), transparent 40%),
    linear-gradient(180deg, rgba(8, 15, 23, 0.98), rgba(17, 18, 40, 0.96)) !important;
  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.30),
    inset 0 0 22px rgba(136, 92, 246, 0.08) !important;
  overflow: hidden !important;
}

.onix-mini-island::before,
.onix-mini-island::after {
  display: none !important;
  content: none !important;
}

.onix-mini-gem {
  width: 21px !important;
  height: 21px !important;
  flex: 0 0 21px !important;
  transform: rotate(45deg) !important;
  border: 1px solid rgba(181, 122, 255, 0.95) !important;
  background:
    linear-gradient(135deg, rgba(255,255,255,0.95) 0 10%, transparent 11% 100%),
    radial-gradient(circle at 60% 60%, #06B6D4 0 22%, #885CF6 23% 58%, rgba(8, 15, 23, 0.96) 59% 100%) !important;
  box-shadow:
    0 0 10px rgba(6, 182, 212, 0.50),
    0 0 16px rgba(136, 92, 246, 0.55) !important;
}

.onix-mini-title {
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif !important;
  font-size: clamp(1.45rem, 5.4vw, 1.84rem) !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  letter-spacing: 0.045em !important;
  color: #fff !important;
  white-space: nowrap !important;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.40) !important;
}

.onix-home-locked .onix-mini-top {
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
}

.onix-home-locked .onix-home-screen {
  height: calc(100dvh - 64px) !important;
  min-height: 0 !important;
  max-height: calc(100dvh - 64px) !important;
  margin-top: 14px !important;
  padding: 0 14px calc(122px + env(safe-area-inset-bottom)) !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-hero-card {
  min-height: 220px !important;
  max-height: 230px !important;
  padding: 18px 16px 16px !important;
  margin: 0 !important;
  border-radius: 28px !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  margin-top: 18px !important;
  width: min(60vw, 246px) !important;
  height: min(60vw, 246px) !important;
}

.onix-home-locked .onix-home-energy-block {
  margin-top: 7px !important;
  padding-bottom: 0 !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 10px !important;
  min-height: 50px !important;
}

.onix-toast-layer,
.onix-home-locked .onix-toast-layer {
  position: fixed !important;
  top: calc(64px + env(safe-area-inset-top)) !important;
  bottom: auto !important;
  z-index: 100000 !important;
}

.onix-modal-layer,
.onix-home-locked .onix-modal-layer {
  z-index: 100001 !important;
  align-items: center !important;
  padding-bottom: calc(112px + env(safe-area-inset-bottom)) !important;
}

@media (max-height: 760px) {
  .onix-mini-top,
  .onix-home-locked .onix-mini-top {
    height: 58px !important;
    min-height: 60px !important;
    max-height: 58px !important;
  }

  .onix-mini-island {
    height: 56px !important;
    min-height: 56px !important;
    max-height: 56px !important;
    padding-top: 13px !important;
  }

  .onix-mini-title {
    font-size: 1.36rem !important;
  }

  .onix-home-locked .onix-home-screen {
    height: calc(100dvh - 58px) !important;
    max-height: calc(100dvh - 58px) !important;
    margin-top: 12px !important;
    padding-bottom: calc(116px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 206px !important;
    max-height: 216px !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 14px !important;
    width: min(57vw, 230px) !important;
    height: min(57vw, 230px) !important;
  }
}


/* Step 30: final clean home layout reset */
html.oc-lock-home-scroll,
body.oc-lock-home-scroll {
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

.onix-home-locked {
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

.onix-home-locked::before,
.onix-home-locked::after {
  pointer-events: none !important;
}

.oc-home-header-wrap {
  position: relative !important;
  z-index: 500 !important;
  width: 100% !important;
  height: 58px !important;
  min-height: 60px !important;
  max-height: 58px !important;
  margin: -8px 0 0 !important;
  padding: 0 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  overflow: visible !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.oc-home-header-wrap::before,
.oc-home-header-wrap::after {
  display: none !important;
  content: none !important;
}

.oc-home-header-wrap--spacer {
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
}

.oc-home-island {
  position: relative !important;
  width: min(72vw, 292px) !important;
  height: 58px !important;
  min-height: 60px !important;
  max-height: 58px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  margin: 0 auto !important;
  padding: 12px 18px 8px !important;
  border-radius: 0 0 26px 26px !important;
  border-left: 1px solid rgba(136, 92, 246, 0.34) !important;
  border-right: 1px solid rgba(136, 92, 246, 0.34) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.34) !important;
  background:
    radial-gradient(circle at 22% 0%, rgba(6, 182, 212, 0.18), transparent 38%),
    radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.22), transparent 40%),
    linear-gradient(180deg, rgba(8, 15, 23, 0.99), rgba(17, 18, 40, 0.96)) !important;
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.28),
    inset 0 0 22px rgba(136, 92, 246, 0.08) !important;
  overflow: hidden !important;
}

.oc-home-island::before,
.oc-home-island::after {
  display: none !important;
  content: none !important;
}

.oc-home-island-gem {
  width: 20px !important;
  height: 20px !important;
  flex: 0 0 20px !important;
  display: block !important;
  transform: rotate(45deg) !important;
  border: 1px solid rgba(181, 122, 255, 0.95) !important;
  background:
    radial-gradient(circle at 62% 62%, #06B6D4 0 24%, #885CF6 25% 58%, rgba(8, 15, 23, 0.96) 59% 100%) !important;
  box-shadow: 0 0 10px rgba(6, 182, 212, 0.5), 0 0 16px rgba(136, 92, 246, 0.55) !important;
}

.oc-home-island-title {
  position: static !important;
  display: inline-block !important;
  transform: none !important;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif !important;
  font-size: clamp(1.45rem, 5.4vw, 1.8rem) !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  letter-spacing: 0.045em !important;
  color: #fff !important;
  white-space: nowrap !important;
  text-align: center !important;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.42) !important;
}

.onix-home-locked .onix-header,
.onix-home-locked .onix-island-header,
.onix-home-locked .onix-mini-top,
.onix-home-locked .onix-mini-island,
.onix-home-locked .onix-clean-header-wrap,
.onix-home-locked .onix-clean-island {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-screen {
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  height: calc(100dvh - 58px) !important;
  min-height: 0 !important;
  max-height: calc(100dvh - 58px) !important;
  margin-top: 12px !important;
  padding: 0 14px calc(116px + env(safe-area-inset-bottom)) !important;
  overflow: hidden !important;
  gap: 0 !important;
}

.onix-home-locked .onix-home-hero-card {
  flex: 0 0 auto !important;
  width: 100% !important;
  min-height: 214px !important;
  max-height: 224px !important;
  padding: 18px 16px 16px !important;
  margin: 0 !important;
  border-radius: 28px !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-balance-row {
  margin-top: 14px !important;
}

.onix-home-locked .onix-home-balance-value {
  margin-top: 10px !important;
  font-size: clamp(2.35rem, 10.8vw, 3.65rem) !important;
  line-height: 1 !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  flex: 0 0 auto !important;
  margin-top: 16px !important;
  width: min(60vw, 244px) !important;
  height: min(60vw, 244px) !important;
}

.onix-home-locked .onix-home-energy-block {
  flex: 0 0 auto !important;
  margin-top: 6px !important;
  padding: 0 2px 6px !important;
  width: 100% !important;
}

.onix-home-locked .onix-home-energy-text {
  font-size: 11px !important;
  line-height: 1.1 !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 6px !important;
  height: 8px !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 10px !important;
  min-height: 48px !important;
  height: 48px !important;
}

.onix-toast-layer {
  top: calc(72px + env(safe-area-inset-top)) !important;
  bottom: auto !important;
  z-index: 1000000 !important;
  pointer-events: none !important;
}

.onix-toast-layer > * {
  pointer-events: auto !important;
}

.onix-modal-layer,
.onix-home-locked .onix-modal-layer {
  z-index: 1000001 !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 18px calc(112px + env(safe-area-inset-bottom)) !important;
}

@media (max-height: 760px) {
  .oc-home-header-wrap {
    height: 54px !important;
    min-height: 54px !important;
    max-height: 54px !important;
  }

  .oc-home-island {
    height: 54px !important;
    min-height: 54px !important;
    max-height: 54px !important;
    padding-top: 11px !important;
  }

  .oc-home-island-title {
    font-size: 1.34rem !important;
  }

  .onix-home-locked .onix-home-screen {
    height: calc(100dvh - 54px) !important;
    max-height: calc(100dvh - 54px) !important;
    margin-top: 10px !important;
    padding-bottom: calc(112px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 204px !important;
    max-height: 214px !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 13px !important;
    width: min(57vw, 232px) !important;
    height: min(57vw, 232px) !important;
  }

  .onix-home-locked .onix-home-tap-button {
    height: 46px !important;
    min-height: 46px !important;
  }
}

/* Step 31: inline header guard */
.onix-home-locked .oc-home-header-wrap,
.onix-home-locked .oc-home-island,
.onix-home-locked .oc-home-island-title,
.onix-home-locked .oc-home-island-gem {
  all: unset !important;
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
}

.onix-home-locked .onix-home-screen {
  margin-top: 8px !important;
}

.onix-home-locked .onix-home-hero-card {
  margin-top: 0 !important;
}

.onix-home-locked .fixed.left-0.right-0.top-4,
.onix-home-locked [class*="toast"] {
  z-index: 9999 !important;
}

/* Step 33: raise tap button higher above nav */
.onix-home-locked .onix-home-energy-block {
  margin-top: -18px !important;
  padding-bottom: 72px !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 5px !important;
}

.onix-home-locked .onix-home-tap-button {
  margin-top: 4px !important;
  height: 48px !important;
  min-height: 48px !important;
  transform: translateY(-38px) !important;
}

.onix-home-locked .onix-home-tap-button:active {
  transform: translateY(-38px) scale(0.98) !important;
}

@media (max-width: 380px) {
  .onix-home-locked .onix-home-energy-block {
    margin-top: -20px !important;
    padding-bottom: 76px !important;
  }

  .onix-home-locked .onix-home-tap-button {
    transform: translateY(-42px) !important;
  }

  .onix-home-locked .onix-home-tap-button:active {
    transform: translateY(-42px) scale(0.98) !important;
  }
}


/* Step 34: force CTA block above bottom navigation */
.onix-home-locked .onix-home-energy-block {
  position: fixed !important;
  left: 22px !important;
  right: 22px !important;
  bottom: calc(118px + env(safe-area-inset-bottom)) !important;
  z-index: 88 !important;
  width: auto !important;
  max-width: 430px !important;
  margin: 0 auto !important;
  padding: 0 !important;
  transform: none !important;
}

.onix-home-locked .onix-home-energy-text {
  justify-content: center !important;
  margin: 0 0 6px 0 !important;
  font-size: 11px !important;
  line-height: 1 !important;
}

.onix-home-locked .onix-home-energy-track {
  margin-top: 0 !important;
  height: 8px !important;
}

.onix-home-locked .onix-home-tap-button {
  position: static !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 48px !important;
  min-height: 48px !important;
  margin: 12px 0 0 0 !important;
  transform: none !important;
  z-index: 88 !important;
}

.onix-home-locked .onix-home-tap-button:active {
  transform: scale(0.98) !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  margin-bottom: 116px !important;
}

.onix-home-locked .onix-nav {
  z-index: 120 !important;
}

@media (max-height: 760px) {
  .onix-home-locked .onix-home-energy-block {
    bottom: calc(112px + env(safe-area-inset-bottom)) !important;
    left: 20px !important;
    right: 20px !important;
  }

  .onix-home-locked .onix-home-tap-button {
    height: 48px !important;
    min-height: 48px !important;
    margin-top: 12px !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-bottom: 104px !important;
  }
}

/* Step 35: Telegram viewport based home layout */
:root {
  --oc-app-height: 100dvh;
  --oc-nav-height: 96px;
  --oc-nav-gap: 22px;
  --oc-cta-height: 70px;
}

html.onix-html-home-lock,
body.onix-body-home-lock,
html.oc-lock-home-scroll,
body.oc-lock-home-scroll {
  height: var(--oc-app-height) !important;
  max-height: var(--oc-app-height) !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

body.onix-body-home-lock {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
}

.onix-home-locked {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  top: 0 !important;
  bottom: auto !important;
  width: 100vw !important;
  height: var(--oc-app-height) !important;
  min-height: var(--oc-app-height) !important;
  max-height: var(--oc-app-height) !important;
  overflow: hidden !important;
  padding-bottom: 0 !important;
  touch-action: none !important;
}

.onix-home-locked .onix-toast-layer,
.onix-toast-layer {
  position: fixed !important;
  top: calc(72px + env(safe-area-inset-top)) !important;
  bottom: auto !important;
  z-index: 2147483000 !important;
  pointer-events: none !important;
}

.onix-toast-layer > * {
  pointer-events: auto !important;
}

.onix-home-locked .onix-modal-layer,
.onix-modal-layer {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147482999 !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 18px 18px calc(132px + env(safe-area-inset-bottom)) !important;
}

.onix-home-locked .onix-nav {
  position: absolute !important;
  left: 10px !important;
  right: 10px !important;
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
  z-index: 500 !important;
  max-width: 430px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}

.onix-home-locked .onix-home-screen {
  position: relative !important;
  height: var(--oc-app-height) !important;
  max-height: var(--oc-app-height) !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  padding: 64px 14px calc(210px + env(safe-area-inset-bottom)) !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}

.onix-home-locked .onix-home-hero-card {
  flex: 0 0 auto !important;
  width: 100% !important;
  min-height: 212px !important;
  max-height: 222px !important;
  padding: 18px 16px 16px !important;
  margin: 0 !important;
  border-radius: 28px !important;
}

.onix-home-locked .onix-home-screen .onix-tap-orb {
  flex: 0 0 auto !important;
  margin-top: 16px !important;
  margin-bottom: 0 !important;
  width: min(59vw, 242px) !important;
  height: min(59vw, 242px) !important;
}

.onix-home-locked .onix-home-energy-block {
  position: absolute !important;
  left: 22px !important;
  right: 22px !important;
  bottom: calc(var(--oc-nav-height) + var(--oc-nav-gap) + env(safe-area-inset-bottom)) !important;
  z-index: 490 !important;
  width: auto !important;
  max-width: 430px !important;
  margin: 0 auto !important;
  padding: 0 !important;
  transform: none !important;
}

.onix-home-locked .onix-home-energy-text {
  justify-content: center !important;
  margin: 0 0 7px 0 !important;
  font-size: 11px !important;
  line-height: 1 !important;
}

.onix-home-locked .onix-home-energy-track {
  margin: 0 !important;
  height: 8px !important;
}

.onix-home-locked .onix-home-tap-button {
  position: static !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 48px !important;
  min-height: 48px !important;
  margin: 13px 0 0 !important;
  transform: none !important;
  z-index: 490 !important;
}

.onix-home-locked .onix-home-tap-button:active {
  transform: scale(0.98) !important;
}

@media (max-height: 760px) {
  :root {
    --oc-nav-height: 98px;
    --oc-nav-gap: 28px;
  }

  .onix-home-locked .onix-home-screen {
    padding-top: 62px !important;
    padding-bottom: calc(220px + env(safe-area-inset-bottom)) !important;
  }

  .onix-home-locked .onix-home-hero-card {
    min-height: 198px !important;
    max-height: 208px !important;
    padding: 16px 15px 14px !important;
  }

  .onix-home-locked .onix-home-balance-value {
    font-size: clamp(2.15rem, 10.2vw, 3.35rem) !important;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    margin-top: 12px !important;
    width: min(54vw, 220px) !important;
    height: min(54vw, 220px) !important;
  }
}

@media (min-height: 830px) {
  :root {
    --oc-nav-gap: 26px;
  }

  .onix-home-locked .onix-home-screen .onix-tap-orb {
    width: min(62vw, 258px) !important;
    height: min(62vw, 258px) !important;
  }
}

/* Step 36: reset Tap page to original reference layout */
.onix-home-reference-mode {
  min-height: var(--oc-app-height, 100vh);
  height: var(--oc-app-height, 100vh);
  max-height: var(--oc-app-height, 100vh);
  overflow: hidden;
  padding-bottom: 0 !important;
}

.onix-home-reference-mode .onix-toast-layer {
  top: 14px !important;
  z-index: 10000 !important;
}

.onix-home-reference-mode .onix-ref-topbar {
  position: relative;
  z-index: 180;
  width: min(100%, 430px);
  margin: 0 auto;
  min-height: 54px;
  padding: 12px 18px 8px;
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  align-items: center;
  color: #fff;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.onix-ref-icon-button {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #E5E7EB;
  background: rgba(8, 15, 23, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.08);
}

.onix-ref-topbar-title {
  text-align: center;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 18px rgba(136, 92, 246, 0.44);
}

.onix-home-reference-mode .onix-home-screen,
.onix-home-reference-mode .onix-ref-home-screen {
  position: relative !important;
  z-index: 4 !important;
  width: min(100%, 430px) !important;
  max-width: 430px !important;
  height: calc(var(--oc-app-height, 100vh) - 54px) !important;
  min-height: 0 !important;
  margin: 0 auto !important;
  padding: 0 14px calc(104px + env(safe-area-inset-bottom)) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  overflow: hidden !important;
  gap: 0 !important;
}

.onix-home-reference-mode .onix-home-hero-card,
.onix-home-reference-mode .onix-ref-player-card {
  width: 100% !important;
  flex: 0 0 auto !important;
  padding: 14px !important;
  border-radius: 18px !important;
  border: 1px solid rgba(136, 92, 246, 0.34) !important;
  background:
    radial-gradient(circle at 88% 10%, rgba(136, 92, 246, 0.34), transparent 34%),
    radial-gradient(circle at 12% 18%, rgba(6, 182, 212, 0.14), transparent 34%),
    linear-gradient(145deg, rgba(11, 18, 32, 0.94), rgba(8, 15, 23, 0.98)) !important;
  box-shadow:
    0 20px 50px rgba(0,0,0,0.38),
    0 0 32px rgba(136, 92, 246, 0.14),
    inset 0 0 28px rgba(136, 92, 246, 0.06) !important;
}

.onix-home-reference-mode .onix-ref-user-row {
  position: relative !important;
  z-index: 2 !important;
}

.onix-home-reference-mode .onix-home-avatar,
.onix-home-reference-mode .onix-ref-avatar {
  width: 50px !important;
  height: 50px !important;
  border-radius: 16px !important;
  display: grid !important;
  place-items: center !important;
}

.onix-home-reference-mode .onix-home-avatar img,
.onix-home-reference-mode .onix-home-rank-mark img {
  width: 76% !important;
  height: 76% !important;
  object-fit: contain !important;
}

.onix-home-reference-mode .onix-home-username,
.onix-home-reference-mode .onix-ref-username {
  font-size: 14px !important;
  line-height: 1.1 !important;
  font-weight: 900 !important;
  color: #fff !important;
}

.onix-home-reference-mode .onix-home-title,
.onix-home-reference-mode .onix-ref-title {
  display: block !important;
  margin-top: 3px !important;
  font-size: 10px !important;
  color: #A855F7 !important;
  font-weight: 700 !important;
}

.onix-home-reference-mode .onix-home-rank-mark,
.onix-home-reference-mode .onix-ref-rank-mark {
  display: grid !important;
  width: 46px !important;
  height: 46px !important;
  border-radius: 15px !important;
  place-items: center !important;
}

.onix-home-reference-mode .onix-home-balance-row,
.onix-home-reference-mode .onix-ref-balance-row {
  margin-top: 12px !important;
  position: relative !important;
  z-index: 2 !important;
}

.onix-home-reference-mode .onix-home-balance-label,
.onix-home-reference-mode .onix-ref-balance-label {
  display: block !important;
  margin: 0 !important;
  text-align: center !important;
  font-size: 10px !important;
  line-height: 1 !important;
  letter-spacing: 0.22em !important;
  text-transform: uppercase !important;
  color: #94A3B8 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.onix-home-reference-mode .onix-home-balance-value,
.onix-home-reference-mode .onix-ref-balance-value {
  margin-top: 6px !important;
  text-align: center !important;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif !important;
  font-size: clamp(2.05rem, 9vw, 3.1rem) !important;
  line-height: 0.96 !important;
  font-weight: 900 !important;
  letter-spacing: -0.06em !important;
  background: linear-gradient(90deg, #FFFFFF 0%, #B7F9FF 36%, #A855F7 76%, #FACC15 100%) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
  text-shadow: 0 0 28px rgba(136, 92, 246, 0.20) !important;
}

.onix-home-reference-mode .onix-home-balance-symbol,
.onix-home-reference-mode .onix-ref-balance-symbol {
  display: block !important;
  margin-top: 5px !important;
  text-align: center !important;
  font-size: 11px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  color: #FACC15 !important;
  letter-spacing: 0.09em !important;
}

.onix-home-reference-mode .onix-home-level-row,
.onix-home-reference-mode .onix-ref-level-row {
  display: block !important;
  margin-top: 12px !important;
  position: relative !important;
  z-index: 2 !important;
}

.onix-home-reference-mode .onix-home-level-meta,
.onix-home-reference-mode .onix-ref-level-meta {
  display: flex !important;
  justify-content: space-between !important;
  gap: 10px !important;
  font-size: 10px !important;
  line-height: 1.2 !important;
  color: #CBD5E1 !important;
  font-weight: 700 !important;
}

.onix-home-reference-mode .onix-home-level-track,
.onix-home-reference-mode .onix-ref-level-track {
  margin-top: 6px !important;
  height: 6px !important;
  overflow: hidden !important;
  border-radius: 999px !important;
  background: rgba(15, 23, 42, 0.94) !important;
  border: 1px solid rgba(136, 92, 246, 0.12) !important;
}

.onix-home-reference-mode .onix-home-level-fill,
.onix-home-reference-mode .onix-ref-level-fill {
  height: 100% !important;
  border-radius: 999px !important;
  background: linear-gradient(90deg, #885CF6, #A855F7, #06B6D4) !important;
  box-shadow: 0 0 18px rgba(136, 92, 246, 0.55) !important;
}

.onix-home-reference-mode .onix-home-mini-rank-row,
.onix-home-reference-mode .onix-home-balance-pill-wrap,
.onix-home-reference-mode .onix-home-balance-label-pill,
.onix-home-reference-mode .onix-home-rank-simple-row,
.onix-home-reference-mode .onix-home-inline-badge {
  display: none !important;
}

.onix-home-reference-mode .onix-tap-orb,
.onix-home-reference-mode .onix-ref-tap-orb {
  flex: 0 0 auto !important;
  margin-top: 16px !important;
  width: min(62vw, 246px) !important;
  height: min(62vw, 246px) !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 246px !important;
  max-height: 246px !important;
}

.onix-home-reference-mode .onix-home-energy-block,
.onix-home-reference-mode .onix-ref-energy-block {
  position: relative !important;
  left: auto !important;
  right: auto !important;
  bottom: auto !important;
  transform: none !important;
  width: 100% !important;
  max-width: none !important;
  margin-top: 8px !important;
  padding: 0 2px !important;
  z-index: 5 !important;
}

.onix-home-reference-mode .onix-home-energy-text,
.onix-home-reference-mode .onix-ref-energy-text {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  font-size: 11px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  color: #DDEBFF !important;
}

.onix-home-reference-mode .onix-home-energy-track,
.onix-home-reference-mode .onix-ref-energy-track {
  margin-top: 7px !important;
  height: 8px !important;
  border-radius: 999px !important;
}

.onix-home-reference-mode .onix-home-tap-button,
.onix-home-reference-mode .onix-ref-tap-button {
  display: block !important;
  width: 100% !important;
  min-height: 44px !important;
  height: 44px !important;
  margin-top: 10px !important;
  border-radius: 14px !important;
  font-size: 15px !important;
  line-height: 1 !important;
}

.onix-home-reference-mode .onix-clean-home-note,
.onix-home-reference-mode .onix-launch-card {
  display: none !important;
}

.onix-home-reference-mode .onix-nav {
  position: fixed !important;
  left: 50% !important;
  right: auto !important;
  bottom: calc(5px + env(safe-area-inset-bottom)) !important;
  transform: translateX(-50%) !important;
  width: min(calc(100vw - 20px), 410px) !important;
  max-width: 410px !important;
  z-index: 900 !important;
  border-radius: 20px !important;
  padding: 6px !important;
}

.onix-home-reference-mode .onix-nav button {
  min-width: 56px !important;
  padding-top: 9px !important;
  padding-bottom: 9px !important;
}

.onix-home-reference-mode .onix-nav button span {
  font-size: 9px !important;
}

@media (max-height: 760px) {
  .onix-home-reference-mode .onix-ref-topbar {
    min-height: 48px;
    padding-top: 9px;
    padding-bottom: 5px;
  }

  .onix-home-reference-mode .onix-ref-home-screen {
    height: calc(var(--oc-app-height, 100vh) - 48px) !important;
    padding-left: 12px !important;
    padding-right: 12px !important;
  }

  .onix-home-reference-mode .onix-ref-player-card {
    padding: 12px !important;
  }

  .onix-home-reference-mode .onix-ref-avatar {
    width: 44px !important;
    height: 44px !important;
  }

  .onix-home-reference-mode .onix-ref-rank-mark {
    width: 42px !important;
    height: 42px !important;
  }

  .onix-home-reference-mode .onix-ref-balance-row {
    margin-top: 9px !important;
  }

  .onix-home-reference-mode .onix-ref-balance-value {
    font-size: clamp(1.9rem, 8.4vw, 2.65rem) !important;
  }

  .onix-home-reference-mode .onix-ref-level-row {
    margin-top: 9px !important;
  }

  .onix-home-reference-mode .onix-ref-tap-orb {
    margin-top: 12px !important;
    width: min(57vw, 224px) !important;
    height: min(57vw, 224px) !important;
  }

  .onix-home-reference-mode .onix-ref-energy-block {
    margin-top: 5px !important;
  }

  .onix-home-reference-mode .onix-ref-tap-button {
    height: 42px !important;
    min-height: 42px !important;
    margin-top: 8px !important;
  }
}



/* Step 37: exact reference top bar placeholders */
.onix-home-reference-mode .onix-ref-topbar {
  position: relative !important;
  z-index: 180 !important;
  width: min(100%, 430px) !important;
  max-width: 430px !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  margin: 0 auto !important;
  padding: 0 14px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-home-reference-mode .onix-ref-topbar::before,
.onix-home-reference-mode .onix-ref-topbar::after {
  display: none !important;
  content: none !important;
}

.onix-home-reference-mode .onix-ref-icon-button {
  position: relative !important;
  z-index: 2 !important;
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 10px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #F8FAFC !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.onix-home-reference-mode .onix-ref-icon-button svg {
  width: 19px !important;
  height: 19px !important;
  stroke-width: 2 !important;
  filter: drop-shadow(0 0 8px rgba(136, 92, 246, 0.28));
}

.onix-home-reference-mode .onix-ref-topbar-title {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  width: max-content !important;
  max-width: calc(100% - 104px) !important;
  margin: 0 !important;
  padding: 0 !important;
  text-align: center !important;
  white-space: nowrap !important;
  color: #FFFFFF !important;
  font-family: 'Orbitron', 'Exo 2', system-ui, sans-serif !important;
  font-size: 14px !important;
  line-height: 1 !important;
  font-weight: 900 !important;
  letter-spacing: 0.045em !important;
  text-transform: uppercase !important;
  text-shadow: 0 0 16px rgba(136, 92, 246, 0.42) !important;
}

.onix-home-reference-mode .onix-ref-home-screen {
  height: calc(var(--oc-app-height, 100vh) - 44px) !important;
}

@media (max-height: 760px) {
  .onix-home-reference-mode .onix-ref-topbar {
    height: 42px !important;
    min-height: 42px !important;
    max-height: 42px !important;
    padding: 0 12px !important;
  }

  .onix-home-reference-mode .onix-ref-topbar-title {
    font-size: 13px !important;
  }

  .onix-home-reference-mode .onix-ref-home-screen {
    height: calc(var(--oc-app-height, 100vh) - 42px) !important;
  }
}

/* Step 38: force inline topbar and prevent legacy broken topbar flow */
.onix-home-reference-mode > .onix-ref-topbar,
.onix-home-reference-mode .onix-ref-topbar {
  display: none !important;
}

.onix-home-reference-mode .onix-ref-home-screen,
.onix-home-reference-mode .onix-home-screen {
  height: calc(var(--oc-app-height, 100vh) - 44px) !important;
}


/* Step 39: seamless Tap background like reference */
.onix-home-reference-mode {
  background:
    radial-gradient(circle at 50% 13%, rgba(136, 92, 246, 0.22), transparent 28%),
    radial-gradient(circle at 82% 30%, rgba(6, 182, 212, 0.10), transparent 30%),
    radial-gradient(circle at 50% 70%, rgba(136, 92, 246, 0.16), transparent 34%),
    linear-gradient(180deg, #050914 0%, #070D18 48%, #040813 100%) !important;
}

.onix-home-reference-mode::before {
  content: '' !important;
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 0 !important;
  opacity: 0.35 !important;
  background-image:
    radial-gradient(circle at 11% 17%, rgba(255,255,255,0.16) 0 1px, transparent 1px),
    radial-gradient(circle at 68% 18%, rgba(0,229,255,0.18) 0 1px, transparent 1px),
    radial-gradient(circle at 88% 66%, rgba(168,85,247,0.14) 0 1px, transparent 1px),
    linear-gradient(90deg, rgba(136,92,246,0.08) 1px, transparent 1px),
    linear-gradient(180deg, rgba(6,182,212,0.045) 1px, transparent 1px) !important;
  background-size: 160px 160px, 220px 220px, 180px 180px, 64px 64px, 64px 64px !important;
}

.onix-home-reference-mode::after {
  content: '' !important;
  position: fixed !important;
  inset: 54px 0 0 !important;
  pointer-events: none !important;
  z-index: 1 !important;
  background:
    radial-gradient(ellipse at 50% 15%, rgba(136, 92, 246, 0.18), transparent 42%),
    radial-gradient(ellipse at 50% 58%, rgba(6, 182, 212, 0.10), transparent 35%),
    linear-gradient(180deg, rgba(8,15,23,0.00) 0%, rgba(8,15,23,0.18) 100%) !important;
}

.onix-home-reference-mode [aria-label="ONIX top navigation"] {
  background: rgba(4, 8, 19, 0.74) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.18) !important;
  box-shadow: 0 14px 42px rgba(0,0,0,0.22) !important;
  backdrop-filter: blur(10px) !important;
}

.onix-home-reference-mode .onix-home-screen,
.onix-home-reference-mode .onix-ref-home-screen {
  z-index: 4 !important;
  padding-left: 14px !important;
  padding-right: 14px !important;
  background: transparent !important;
}

.onix-home-reference-mode .onix-home-hero-card,
.onix-home-reference-mode .onix-ref-player-card {
  width: 100% !important;
  padding: 12px 8px 4px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.onix-home-reference-mode .onix-home-hero-card::before,
.onix-home-reference-mode .onix-home-hero-card::after,
.onix-home-reference-mode .onix-ref-player-card::before,
.onix-home-reference-mode .onix-ref-player-card::after {
  display: none !important;
  content: none !important;
}

.onix-home-reference-mode .onix-ref-user-row,
.onix-home-reference-mode .onix-home-user-row {
  padding: 0 4px !important;
}

.onix-home-reference-mode .onix-home-avatar,
.onix-home-reference-mode .onix-ref-avatar,
.onix-home-reference-mode .onix-home-rank-mark,
.onix-home-reference-mode .onix-ref-rank-mark {
  background: rgba(8, 15, 23, 0.50) !important;
  border: 1px solid rgba(136, 92, 246, 0.32) !important;
  box-shadow: 0 0 24px rgba(136, 92, 246, 0.26), inset 0 0 18px rgba(6, 182, 212, 0.08) !important;
}

.onix-home-reference-mode .onix-home-balance-row,
.onix-home-reference-mode .onix-ref-balance-row {
  margin-top: 14px !important;
}

.onix-home-reference-mode .onix-home-level-row,
.onix-home-reference-mode .onix-ref-level-row {
  margin-top: 10px !important;
  padding: 0 4px !important;
}

.onix-home-reference-mode .onix-ref-tap-orb {
  margin-top: 18px !important;
}

.onix-home-reference-mode .onix-nav {
  border-color: rgba(136, 92, 246, 0.34) !important;
}


/* Step 40: real seamless Tap canvas - remove player card box completely */
.onix-home-reference-mode {
  background:
    radial-gradient(circle at 18% 12%, rgba(136, 92, 246, 0.20), transparent 28%),
    radial-gradient(circle at 82% 18%, rgba(6, 182, 212, 0.13), transparent 30%),
    radial-gradient(circle at 50% 62%, rgba(136, 92, 246, 0.18), transparent 36%),
    linear-gradient(180deg, #050913 0%, #07101D 48%, #040812 100%) !important;
}

.onix-home-reference-mode .onix-ref-home-screen {
  padding-left: 14px !important;
  padding-right: 14px !important;
  background: transparent !important;
}

.onix-home-reference-mode .oc-seamless-player-block {
  width: 100% !important;
  position: relative !important;
  z-index: 5 !important;
  padding: 12px 8px 0 !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  outline: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  overflow: visible !important;
}

.onix-home-reference-mode .oc-seamless-player-block::before,
.onix-home-reference-mode .oc-seamless-player-block::after {
  display: none !important;
  content: none !important;
}

.onix-home-reference-mode .oc-seamless-player-block * {
  box-sizing: border-box !important;
}

.onix-home-reference-mode .oc-seamless-player-block .onix-home-user-row,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-user-row {
  padding: 0 4px !important;
  margin: 0 !important;
}

.onix-home-reference-mode .oc-seamless-player-block .onix-home-avatar,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-avatar,
.onix-home-reference-mode .oc-seamless-player-block .onix-home-rank-mark,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-rank-mark {
  border-radius: 16px !important;
  border: 1px solid rgba(136, 92, 246, 0.34) !important;
  background: rgba(8, 15, 23, 0.46) !important;
  box-shadow:
    0 0 26px rgba(136, 92, 246, 0.30),
    inset 0 0 18px rgba(6, 182, 212, 0.09) !important;
}

.onix-home-reference-mode .oc-seamless-player-block .onix-home-balance-row,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-balance-row {
  margin-top: 12px !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.onix-home-reference-mode .oc-seamless-player-block .onix-home-level-row,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-level-row {
  margin-top: 10px !important;
  padding: 0 4px !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}

.onix-home-reference-mode .oc-seamless-player-block .onix-home-level-track,
.onix-home-reference-mode .oc-seamless-player-block .onix-ref-level-track {
  height: 7px !important;
  background: rgba(15, 23, 42, 0.82) !important;
  border: 1px solid rgba(136, 92, 246, 0.10) !important;
}

.onix-home-reference-mode .onix-ref-tap-orb {
  margin-top: 18px !important;
}


/* Step 41: reference dark cosmic background - hard override */
body:has(.onix-home-reference-mode) {
  background: #02050d !important;
}

.onix-home-reference-mode {
  isolation: isolate !important;
  background:
    radial-gradient(ellipse at 50% -8%, rgba(136, 92, 246, 0.24) 0%, rgba(136, 92, 246, 0.10) 22%, transparent 47%),
    radial-gradient(ellipse at 105% 18%, rgba(6, 182, 212, 0.16) 0%, transparent 36%),
    radial-gradient(ellipse at -12% 36%, rgba(88, 28, 135, 0.18) 0%, transparent 38%),
    radial-gradient(ellipse at 50% 78%, rgba(91, 33, 246, 0.14) 0%, transparent 42%),
    linear-gradient(180deg, #030712 0%, #050A16 34%, #030712 68%, #02040B 100%) !important;
  background-color: #02050d !important;
}

.onix-home-reference-mode::before {
  content: '' !important;
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  opacity: 0.62 !important;
  background-image:
    radial-gradient(circle at 6% 9%, rgba(255,255,255,0.20) 0 1px, transparent 1.4px),
    radial-gradient(circle at 22% 18%, rgba(6, 182, 212, 0.25) 0 1px, transparent 1.5px),
    radial-gradient(circle at 82% 15%, rgba(168, 85, 247, 0.22) 0 1px, transparent 1.5px),
    radial-gradient(circle at 72% 42%, rgba(255,255,255,0.13) 0 1px, transparent 1.4px),
    radial-gradient(circle at 12% 74%, rgba(6, 182, 212, 0.16) 0 1px, transparent 1.4px),
    linear-gradient(90deg, rgba(136, 92, 246, 0.035) 1px, transparent 1px),
    linear-gradient(180deg, rgba(6, 182, 212, 0.028) 1px, transparent 1px) !important;
  background-size:
    128px 128px,
    172px 172px,
    210px 210px,
    150px 150px,
    190px 190px,
    64px 64px,
    64px 64px !important;
  background-position: 0 0, 18px 42px, 36px 16px, 8px 96px, 46px 24px, 0 0, 0 0 !important;
}

.onix-home-reference-mode::after {
  content: '' !important;
  position: fixed !important;
  inset: 44px 0 0 !important;
  z-index: 1 !important;
  pointer-events: none !important;
  opacity: 1 !important;
  background:
    radial-gradient(ellipse at 50% 12%, rgba(136, 92, 246, 0.21), transparent 34%),
    radial-gradient(ellipse at 50% 45%, rgba(0, 229, 255, 0.075), transparent 31%),
    radial-gradient(ellipse at 50% 74%, rgba(136, 92, 246, 0.11), transparent 38%),
    linear-gradient(180deg, rgba(2, 5, 13, 0.12) 0%, rgba(2, 5, 13, 0.0) 36%, rgba(2, 5, 13, 0.38) 100%) !important;
}

.onix-home-reference-mode [aria-label="ONIX top navigation"] {
  position: relative !important;
  z-index: 10 !important;
  background: rgba(2, 5, 13, 0.62) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.16) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.26) !important;
  backdrop-filter: blur(12px) !important;
}

.onix-home-reference-mode .onix-ref-home-screen,
.onix-home-reference-mode .onix-home-screen {
  position: relative !important;
  z-index: 5 !important;
  background: transparent !important;
}

.onix-home-reference-mode .oc-seamless-player-block,
.onix-home-reference-mode .onix-ref-player-card,
.onix-home-reference-mode .onix-home-hero-card {
  background: transparent !important;
  background-image: none !important;
  border: 0 !important;
  box-shadow: none !important;
}

.onix-home-reference-mode .oc-seamless-player-block::before,
.onix-home-reference-mode .oc-seamless-player-block::after,
.onix-home-reference-mode .onix-ref-player-card::before,
.onix-home-reference-mode .onix-ref-player-card::after,
.onix-home-reference-mode .onix-home-hero-card::before,
.onix-home-reference-mode .onix-home-hero-card::after {
  display: none !important;
  content: none !important;
}

.onix-home-reference-mode .onix-ref-tap-orb,
.onix-home-reference-mode .onix-tap-orb {
  background: radial-gradient(circle, rgba(136, 92, 246, 0.17) 0%, rgba(6, 182, 212, 0.06) 34%, transparent 66%) !important;
}

/* Step 42: REAL visible reference cosmic background override */
html:has(.onix-home-reference-mode),
body:has(.onix-home-reference-mode),
#root:has(.onix-home-reference-mode) {
  background: #02040b !important;
  overflow-x: hidden !important;
}

.onix-home-reference-mode.onix-app-bg,
.onix-home-reference-mode {
  background-color: #02040b !important;
  background-image:
    radial-gradient(ellipse at 50% 2%, rgba(136, 92, 246, 0.42) 0%, rgba(78, 25, 130, 0.20) 22%, transparent 48%),
    radial-gradient(ellipse at 92% 20%, rgba(6, 182, 212, 0.22) 0%, rgba(6, 182, 212, 0.09) 22%, transparent 48%),
    radial-gradient(ellipse at 8% 38%, rgba(139, 92, 246, 0.26) 0%, rgba(88, 28, 135, 0.12) 28%, transparent 54%),
    radial-gradient(ellipse at 50% 76%, rgba(76, 29, 149, 0.33) 0%, rgba(76, 29, 149, 0.10) 34%, transparent 62%),
    linear-gradient(180deg, #050711 0%, #070a16 22%, #030712 56%, #02040b 100%) !important;
  background-size: 100% 100% !important;
  background-repeat: no-repeat !important;
  position: relative !important;
  isolation: isolate !important;
}

.onix-home-reference-mode.onix-app-bg::before {
  content: '' !important;
  position: fixed !important;
  inset: 44px 0 0 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  opacity: 1 !important;
  background-image:
    radial-gradient(circle at 7% 8%, rgba(255,255,255,0.36) 0 1px, transparent 1.6px),
    radial-gradient(circle at 21% 22%, rgba(6, 182, 212, 0.34) 0 1px, transparent 1.5px),
    radial-gradient(circle at 82% 18%, rgba(168, 85, 247, 0.38) 0 1px, transparent 1.5px),
    radial-gradient(circle at 62% 35%, rgba(255,255,255,0.22) 0 1px, transparent 1.4px),
    radial-gradient(circle at 13% 58%, rgba(136, 92, 246, 0.32) 0 1px, transparent 1.5px),
    radial-gradient(circle at 88% 68%, rgba(6, 182, 212, 0.20) 0 1px, transparent 1.5px),
    linear-gradient(90deg, rgba(136, 92, 246, 0.070) 1px, transparent 1px),
    linear-gradient(180deg, rgba(6, 182, 212, 0.055) 1px, transparent 1px) !important;
  background-size:
    94px 94px,
    138px 138px,
    166px 166px,
    118px 118px,
    176px 176px,
    150px 150px,
    64px 64px,
    64px 64px !important;
  background-position: 0 0, 22px 36px, 44px 8px, 12px 88px, 38px 52px, 70px 16px, 0 0, 0 0 !important;
  mask-image: linear-gradient(180deg, transparent 0%, #000 9%, #000 92%, transparent 100%);
}

.onix-home-reference-mode.onix-app-bg::after {
  content: '' !important;
  position: fixed !important;
  inset: 44px 0 0 0 !important;
  z-index: 1 !important;
  pointer-events: none !important;
  opacity: 1 !important;
  background:
    radial-gradient(ellipse at 48% 18%, rgba(136, 92, 246, 0.30) 0%, transparent 33%),
    radial-gradient(ellipse at 54% 48%, rgba(0, 229, 255, 0.12) 0%, transparent 34%),
    radial-gradient(ellipse at 50% 88%, rgba(88, 28, 135, 0.38) 0%, transparent 44%),
    linear-gradient(180deg, rgba(2, 4, 11, 0.04) 0%, transparent 38%, rgba(2, 4, 11, 0.42) 100%) !important;
}

.onix-home-reference-mode [aria-label="ONIX top navigation"] {
  background: linear-gradient(90deg, rgba(9, 12, 24, 0.92), rgba(22, 16, 43, 0.80), rgba(9, 12, 24, 0.92)) !important;
  border-bottom: 1px solid rgba(136, 92, 246, 0.18) !important;
}

.onix-home-reference-mode .onix-ref-home-screen,
.onix-home-reference-mode .onix-home-screen {
  background: transparent !important;
  position: relative !important;
  z-index: 5 !important;
}

.onix-home-reference-mode .onix-ref-home-screen::before,
.onix-home-reference-mode .onix-home-screen::before {
  content: '' !important;
  position: absolute !important;
  inset: 0 -14px !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(136, 92, 246, 0.20), transparent 42%),
    radial-gradient(ellipse at 50% 58%, rgba(6, 182, 212, 0.08), transparent 36%) !important;
}

`;

    window.open(url, '_blank');
  };

  const loadAdminOperations = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-operations`, {
        params: { telegramId },
      });

      setAdminOperations(response.data);
      showToast('✅ Операции обновлены', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить операции', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const addAdminNote = async () => {
    const telegramId = getTelegramId();

    if (!adminSelectedUser) {
      showToast('Сначала выберите игрока в поиске', 'error');
      return;
    }

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-user-note`, {
        telegramId,
        targetTelegramId: adminSelectedUser.telegramId,
        text: adminNoteText,
      });

      setAdminSelectedUser({
        ...adminSelectedUser,
        adminNotes: response.data.notes || [],
        securityLogs: response.data.securityLogs || adminSelectedUser.securityLogs,
      });
      setAdminNoteText('');
      showToast('✅ Заметка добавлена', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось добавить заметку', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadAdminEconomyDashboard = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-economy-dashboard`, {
        params: {
          telegramId,
        },
      });

      setAdminEconomyDashboard(response.data);
      setAdminEconomyVisible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить экономику', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadSuspiciousUsers = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-suspicious-users`, {
        params: {
          telegramId,
        },
      });

      setSuspiciousUsers(response.data.users || []);
      setSuspiciousUsersVisible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить список', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const toggleFreezeUser = async (target: SuspiciousUser) => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      await axios.post(`${API_URL}/admin-freeze-user`, {
        telegramId,
        targetTelegramId: target.telegramId,
        freeze: !target.isFrozen,
        reason: target.isFrozen ? '' : 'Заморожен из админ-панели',
      });

      showToast(target.isFrozen ? '✅ Аккаунт разморожен' : '🧊 Аккаунт заморожен', 'success');
      await loadSuspiciousUsers();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось изменить статус', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const loadAdminWithdrawals = async () => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      const response = await axios.get(`${API_URL}/admin-withdrawals`, {
        params: {
          telegramId,
          status: 'pending',
        },
      });

      setAdminWithdrawals(response.data.requests || []);
      setAdminWithdrawalsVisible(true);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось загрузить заявки', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const reviewWithdrawal = async (
    request: AdminWithdrawalRequest,
    action: 'approved' | 'rejected'
  ) => {
    const telegramId = getTelegramId();

    try {
      setIsAdminLoading(true);

      await axios.post(`${API_URL}/admin-review-withdrawal`, {
        telegramId,
        userTelegramId: request.userTelegramId,
        requestIndex: request.requestIndex,
        action,
        adminComment: adminWithdrawalComment,
      });

      showToast(
        action === 'approved' ? '✅ Вывод одобрен' : '↩️ Вывод отклонён',
        'success'
      );

      setAdminWithdrawalComment('');
      await loadAdminWithdrawals();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось обработать заявку', 'error');
    } finally {
      setIsAdminLoading(false);
    }
  };

  const requestWithdrawal = async () => {
    const telegramId = getTelegramId();

    if (!canWithdraw || isWithdrawalLoading) return;

    if (withdrawalCheck.trim().toUpperCase() !== 'ONIX') {
      showToast('Введите ONIX в поле антибот-проверки', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Создать заявку на вывод ${formatOnix(minWithdrawOnix)} ONIX?`
    );

    if (!confirmed) return;

    try {
      setIsWithdrawalLoading(true);

      const response = await axios.post(`${API_URL}/request-withdrawal`, {
        telegramId,
        amount: minWithdrawOnix,
        withdrawalCheck,
      });

      const user = response.data.user;

      setBalance(user.balance || 0);
      setTransactions(user.transactions || []);
      setWithdrawalRequests(user.withdrawalRequests || []);
      setWithdrawalCheck('');
      showToast('✅ Заявка на вывод создана', 'success');
      refreshAfterAction();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось создать заявку', 'error');
    } finally {
      setIsWithdrawalLoading(false);
    }
  };

  const awardWeeklyPrizes = async () => {
    const telegramId = getTelegramId();

    if (!adminPrizePreview || adminPrizePreview.alreadyAwarded) return;

    const confirmed = window.confirm(
      `Выдать призы топ-3 за неделю ${adminPrizePreview.week}?`
    );

    if (!confirmed) return;

    try {
      setIsAdminLoading(true);

      const response = await axios.post(`${API_URL}/admin-award-weekly-prizes`, {
        telegramId,
        confirm: 'AWARD_WEEKLY_PRIZES',
        week: adminPrizePreview.week,
      });

      showToast('✅ Призы сезона выданы');

      setAdminPrizePreview({
        ...adminPrizePreview,
        alreadyAwarded: true,
        awardedWinners: response.data.winners || [],
      });
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось выдать призы');
    } finally {
      setIsAdminLoading(false);
    }
  };


  const normalizePerkLevels = (levels: any) => {
    if (!levels) return {};

    if (levels instanceof Map) {
      return Object.fromEntries(levels.entries());
    }

    if (typeof levels === 'object') {
      return Object.fromEntries(
        Object.entries(levels).map(([key, value]) => [key, Number(value || 0)])
      );
    }

    return {};
  };

  const getPerkLevel = (perkId: string) => {
    return Number((perkLevels as any)?.[perkId] || 0);
  };

  const getPerkCost = (baseCost: number, nextLevel: number) => {
    return Math.round(baseCost * Math.pow(1.85, nextLevel - 1));
  };

  const getAchievementCategory = (id: string): AchievementCategory => {
    if (id.includes('tap')) return 'taps';
    if (id.includes('miner') || id.includes('offline')) return 'miner';
    if (id.includes('friend')) return 'referrals';
    if (id.includes('weekly') || id.includes('season')) return 'seasons';
    if (id.includes('perk')) return 'perks';
    if (id.includes('streak') || id.includes('daily')) return 'daily';
    if (id.includes('rank')) return 'ranks';

    return 'all';
  };

  const getProfileBadges = () => {
    const badges: Array<{ icon: string; label: string }> = [];

    if (rankInfo.currentRank.threshold >= 750000) {
      badges.push({ icon: '🥇', label: 'Gold+' });
    }

    if (rankInfo.currentRank.id === 'diamond' || rankInfo.currentRank.threshold >= 5000000) {
      badges.push({ icon: '💎', label: 'Diamond' });
    }

    if (referralsCount >= 5) {
      badges.push({ icon: '👥', label: 'Referral' });
    }

    if (dailyStreak >= 7) {
      badges.push({ icon: '🔥', label: 'Streak' });
    }

    if (ownedPerks.length >= 4) {
      badges.push({ icon: '🧩', label: 'Perks' });
    }

    if (currentUserPlace && currentUserPlace <= 3) {
      badges.push({ icon: '🏆', label: 'Top 3' });
    } else if (currentUserPlace && currentUserPlace <= 10) {
      badges.push({ icon: '🎖', label: 'Top 10' });
    }

    return badges.slice(0, 6);
  };

  const getAvailableTitles = () => {
    const titles = ['ONIX Player'];

    if (totalTaps >= 10000) titles.push('Tap Master');
    if (minerLevel >= 5) titles.push('Miner');
    if (referralsCount >= 5) titles.push('Referral Master');
    if (currentUserPlace && currentUserPlace <= 10) titles.push('Season Hunter');
    if (rankInfo.currentRank.threshold >= 5000000) titles.push('Diamond');
    if (totalBoostsUsed >= 10) titles.push('Boost Master');
    if (ownedPerks.length >= 4) titles.push('Perk Collector');

    return titles;
  };

  const getLeagueIcon = (value: string) => {
    if (value === 'Diamond') return '💎';
    if (value === 'Gold') return '🥇';
    if (value === 'Silver') return '🥈';

    return '🥉';
  };

  const saveTeamName = async () => {
    const telegramId = getTelegramId();

    try {
      const response = await axios.post(`${API_URL}/set-team`, {
        telegramId,
        teamName: teamNameInput,
      });

      const user = response.data.user;

      setTeamName(user.teamName || '');
      setTeamNameInput(user.teamName || '');
      showToast('✅ Команда обновлена', 'success');
      loadTeamSocialDashboard();
      loadFriendLeaderboard();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось сохранить команду', 'error');
    }
  };

  const selectProfileTitle = async (title: string) => {
    const telegramId = getTelegramId();

    try {
      const response = await axios.post(`${API_URL}/select-title`, {
        telegramId,
        title,
      });

      const user = response.data.user;

      setSelectedTitle(user.selectedTitle || title);
      showToast('✅ Титул обновлён', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Не удалось выбрать титул', 'error');
    }
  };

  const rankInfo = getRankInfo(totalEarned);
  const rankProgress = rankInfo.progressPercent;
  const rankProgressText = rankInfo.nextRank
    ? `${formatOnix(rankInfo.progressCurrent)} / ${formatOnix(rankInfo.progressTotal)}`
    : 'MAX';
  const currentRankBonus = rankInfo.currentRank.bonus || 0;
  const nextRankBonus = rankInfo.nextRank?.bonus || 0;
  const profileLevel = Math.max(1, Math.floor(totalEarned / 100000) + 1);
  const profileLevelProgress = Math.min(((totalEarned % 100000) / 100000) * 100, 100);
  const profileBadges = getProfileBadges();
  const availableTitles = getAvailableTitles();
  const activeBoostValue = normalizeBoost(activeBoost);
  const normalizedBoostEndTime = Number(boostEndTime || 0);
  const isBoostActive =
    activeBoostValue !== 'none' && Date.now() < normalizedBoostEndTime;

  const miningMultiplier =
    activeBoostValue === 'mining' && isBoostActive ? 2 : 1;
  const offlineProLevel = getPerkLevel('offline_pro');
  const energySaverLevel = getPerkLevel('energy_saver');
  const dailyPlusLevel = getPerkLevel('daily_plus');
  const minerPlusLevel = getPerkLevel('miner_plus');
  const boostMasterLevel = getPerkLevel('boost_master');
  const streakShieldLevel = getPerkLevel('streak_shield');
  const luckyMinerLevel = getPerkLevel('lucky_miner');
  const referralProLevel = getPerkLevel('referral_pro');
  const energyMaxProLevel = getPerkLevel('energy_max_pro');
  const engineerLevel = getPerkLevel('engineer');

  const minerBaseMultiplier = 1 + 0.05 * minerPlusLevel + 0.03 * luckyMinerLevel;
  const minerIncomePerSecond = Number(
    (autoclickers * minerBaseMultiplier * miningMultiplier).toFixed(2)
  );
  const minerIncomePerHour = minerIncomePerSecond * 60 * 60;

  const effectiveTapEnergyCost = Math.max(
    1,
    Number((tapPower * Math.max(0.7, 1 - 0.1 * energySaverLevel)).toFixed(2))
  );
  const baseDailyPreview = getDailyReward(level);
  const effectiveDailyPreview = Math.round(
    baseDailyPreview * (1 + 0.1 * dailyPlusLevel)
  );
  const maxOfflineHours = 3 + offlineProLevel;
  const maxOfflineIncome = minerIncomePerSecond * maxOfflineHours * 60 * 60;

  const upgradeDiscountMultiplier = Math.max(0.85, 1 - 0.05 * engineerLevel);

  const nextTapCost = Math.round(getTapUpgradeCost(tapLevel) * upgradeDiscountMultiplier);
  const nextMinerCost = Math.round(getMinerUpgradeCost(minerLevel) * upgradeDiscountMultiplier);
  const nextEnergyCost = Math.round(getEnergyUpgradeCost(energyLevel) * upgradeDiscountMultiplier);
  const nextRechargeCost = Math.round(
    getRechargeUpgradeCost(rechargeLevel) * upgradeDiscountMultiplier
  );

  const minerUpgradeProgress = Math.min((balance / nextMinerCost) * 100, 100);
  const nextMinerIncomePerSecond = Number(
    ((autoclickers + 0.5) * minerBaseMultiplier * miningMultiplier).toFixed(2)
  );
  const minerIncomeIncrease = nextMinerIncomePerSecond - minerIncomePerSecond;

  const upgradeCards: Array<{
    type: 'tap' | 'miner' | 'energy' | 'recharge';
    icon: string;
    title: string;
    description: string;
    level: number;
    cost: number;
    currentLabel: string;
    currentValue: string;
    nextLabel: string;
    nextValue: string;
  }> = [
    {
      type: 'tap',
      icon: '🎯',
      title: 'Сила тапа',
      description: 'Больше ONIX за каждый тап',
      level: tapLevel,
      cost: nextTapCost,
      currentLabel: 'Сейчас',
      currentValue: `+${formatOnix(tapPower)} ONIX/тап`,
      nextLabel: 'После апгрейда',
      nextValue: `+${formatOnix(tapPower + 1)} ONIX/тап`,
    },
    {
      type: 'miner',
      icon: '⛏️',
      title: 'Майнер',
      description: 'Пассивный доход ONIX',
      level: minerLevel,
      cost: nextMinerCost,
      currentLabel: 'Сейчас',
      currentValue: `+${formatOnix(minerIncomePerSecond)} ONIX/сек`,
      nextLabel: 'После апгрейда',
      nextValue: `+${formatOnix(nextMinerIncomePerSecond)} ONIX/сек`,
    },
    {
      type: 'energy',
      icon: '🔋',
      title: 'Энергия',
      description: 'Больше максимальной энергии',
      level: energyLevel,
      cost: nextEnergyCost,
      currentLabel: 'Сейчас',
      currentValue: `${maxEnergy.toLocaleString('ru-RU')} энергии`,
      nextLabel: 'После апгрейда',
      nextValue: `${(maxEnergy + 500).toLocaleString('ru-RU')} энергии`,
    },
    {
      type: 'recharge',
      icon: '⚡',
      title: 'Восстановление',
      description: 'Энергия быстрее восстанавливается',
      level: rechargeLevel,
      cost: nextRechargeCost,
      currentLabel: 'Сейчас',
      currentValue: `+${formatOnix(energyRecharge)} энергии/сек`,
      nextLabel: 'После апгрейда',
      nextValue: `+${formatOnix(energyRecharge + 0.25)} энергии/сек`,
    },
  ];

  void [
    referralProLevel,
    minerIncomePerHour,
    effectiveTapEnergyCost,
    effectiveDailyPreview,
    maxOfflineIncome,
    minerUpgradeProgress,
    minerIncomeIncrease,
    upgradeCards,
    lastChestReward,
    openChest,
    streakShieldLevel,
  ];

  const boostRemainingMs = Math.max(boostEndTime - Date.now(), 0);
  const boostTimeLeft = boostRemainingMs > 0 ? formatTime(boostRemainingMs) : '';
  const isAnyBoostActive = isBoostActive && activeBoost !== 'none';

  const onixEurRate = Number(economyConfig.onixEurPer1000 || DEFAULT_ONIX_EUR_PER_1000) / 1000;
  const minWithdrawOnix = Number(economyConfig.minWithdrawOnix || DEFAULT_MIN_WITHDRAW_ONIX);
  const balanceInEur = balance * onixEurRate;
  const withdrawProgress = Math.min((balance / minWithdrawOnix) * 100, 100);
  const leftToWithdraw = Math.max(minWithdrawOnix - balance, 0);

  const completedAchievementsCount = achievements.filter(
    (item: Achievement) => item.isCompleted
  ).length;

  const visibleAchievements = achievements.filter((item: Achievement) => {
    if (item.isCompleted) return false;
    if (achievementCategory === 'all') return true;

    return getAchievementCategory(item.id) === achievementCategory;
  });

  const canWithdraw = balance >= minWithdrawOnix;

  const transactionFilters: Array<{
    id: TransactionFilter;
    label: string;
  }> = [
    { id: 'all', label: 'Все' },
    { id: 'income', label: 'Доходы' },
    { id: 'expense', label: 'Расходы' },
    { id: 'withdrawal', label: 'Выводы' },
    { id: 'referral', label: 'Рефералы' },
    { id: 'season', label: 'Сезоны' },
    { id: 'missions', label: 'Миссии' },
  ];

  const filteredTransactions = transactions.filter((transaction) => {
    const type = transaction.type || '';
    const amount = Number(transaction.amount || 0);

    if (transactionFilter === 'all') return true;
    if (transactionFilter === 'income') return amount > 0;
    if (transactionFilter === 'expense') return amount < 0;
    if (transactionFilter === 'withdrawal') return type.includes('withdrawal');
    if (transactionFilter === 'referral') return type.includes('referral');
    if (transactionFilter === 'season') return type.includes('season');
    if (transactionFilter === 'missions') return type.includes('mission');

    return true;
  });

  const walletIncomeTotal = transactions
    .filter((transaction) => Number(transaction.amount || 0) > 0)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const walletExpenseTotal = transactions
    .filter((transaction) => Number(transaction.amount || 0) < 0)
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount || 0)), 0);
  const walletPendingWithdrawal = withdrawalRequests
    .filter((request) => request.status === 'pending')
    .reduce((sum, request) => sum + Number(request.amount || 0), 0);

  const earningChartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);

    const amount = transactions
      .filter((transaction) => {
        if (Number(transaction.amount || 0) <= 0 || !transaction.createdAt) return false;

        return new Date(transaction.createdAt).toISOString().slice(0, 10) === key;
      })
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    return {
      key,
      label: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      amount,
    };
  });
  const maxChartAmount = Math.max(
    ...earningChartDays.map((item) => item.amount),
    1
  );
  const tutorialSteps = [
    {
      icon: '🪙',
      title: 'Тапай и зарабатывай',
      text: 'Нажимай на монету, получай ONIX и следи за энергией.',
    },
    {
      icon: '⚡',
      title: 'Прокачивайся',
      text: 'Покупай улучшения, перки и бусты, чтобы зарабатывать быстрее.',
    },
    {
      icon: '📋',
      title: 'Выполняй задания',
      text: 'Daily, weekly и секретные миссии дают дополнительные ONIX.',
    },
    {
      icon: '🏆',
      title: 'Соревнуйся',
      text: 'Попадай в топ недели, команды и сезоны, чтобы получать призы.',
    },
  ];

  const closeTutorial = () => {
    localStorage.setItem('onixTutorialDone', 'true');
    setTutorialVisible(false);
  };

  const achievementCategories: Array<{
    id: AchievementCategory;
    label: string;
  }> = [
    { id: 'all', label: 'Все' },
    { id: 'taps', label: 'Тапы' },
    { id: 'miner', label: 'Майнер' },
    { id: 'referrals', label: 'Рефералы' },
    { id: 'seasons', label: 'Сезоны' },
    { id: 'perks', label: 'Перки' },
    { id: 'daily', label: 'Daily' },
    { id: 'ranks', label: 'Ранги' },
  ];

  const referralProgress = Math.min(
    (Number(referralLimit.used || 0) / Number(referralLimit.max || 10)) * 100,
    100
  );

  const referralResetTime = formatTime(referralLimit.secondsUntilReset * 1000);
  const seasonTimeLeft = formatTime(seasonSecondsLeft * 1000);

  const nextDailyStreakDay =
    dailyCooldown > 0
      ? Math.max(1, Number(dailyStreak || 1))
      : Number(dailyStreak || 0) >= 7
      ? 1
      : Number(dailyStreak || 0) + 1;

  const dailyRewardPreview = Math.round(
    getDailyRewardWithStreak(level, nextDailyStreakDay) *
      (1 + 0.1 * dailyPlusLevel)
  );
  const dailyStreakMultiplier = getDailyStreakMultiplier(nextDailyStreakDay);

  const boostCards: Array<{
    type: 'tap' | 'mining';
    icon: string;
    title: string;
    description: string;
    multiplier: string;
    durationMinutes: number;
    cost: number;
    isActive: boolean;
  }> = [
    {
      type: 'tap',
      icon: '🎯',
      title: 'Буст тапа',
      description: 'Увеличивает силу тапа на время действия',
      multiplier: '×2',
      durationMinutes: 10,
      cost: getTapBoostCost(tapPower),
      isActive: isBoostActive && activeBoostValue === 'tap',
    },
    {
      type: 'mining',
      icon: '⛏️',
      title: 'Буст майнинга',
      description: 'Удваивает доход майнера онлайн',
      multiplier: '×2',
      durationMinutes: 15,
      cost: getMiningBoostCost(autoclickers),
      isActive: isBoostActive && activeBoostValue === 'mining',
    },
  ];

  if (isAppLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-yellow-400/20 bg-[#111827] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-yellow-400 text-4xl">
            🔗
          </div>

          <h1 className="text-3xl font-black text-white">ONIX COIN</h1>
          <p className="mt-3 text-sm text-gray-400">Загрузка майнера...</p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-gray-800">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-yellow-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`onix-app-bg min-h-screen text-white ${activeTab === 'home' ? 'onix-home-reference-mode' : ''}`}>
      <style>{ONIX_THEME_STYLE}</style>
      <div className="onix-toast-layer fixed left-0 right-0 top-[78px] z-[10000] flex flex-col items-center gap-2 px-4">
        {toastMessages.map((toast) => (
          <div
            key={toast.id}
            className={`w-full max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-2xl ${
              toast.type === 'success'
                ? 'bg-emerald-500 text-white'
                : toast.type === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-[#111827] text-yellow-400 border border-yellow-400/30'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      {activeTab === 'home' && (
        <div
          aria-label="ONIX top navigation"
          style={{
            width: '100%',
            maxWidth: 430,
            height: 44,
            minHeight: 44,
            margin: '0 auto',
            padding: '0 14px',
            display: 'grid',
            gridTemplateColumns: '36px 1fr 36px',
            alignItems: 'center',
            position: 'relative',
            zIndex: 500,
            background: 'transparent',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            aria-label="Меню"
            style={{
              width: 34,
              height: 34,
              border: 0,
              padding: 0,
              margin: 0,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: '#FFFFFF',
              boxShadow: 'none',
              outline: 'none',
            }}
          >
            <Menu size={20} strokeWidth={2.2} />
          </button>

          <div
            style={{
              textAlign: 'center',
              color: '#FFFFFF',
              fontFamily: "Orbitron, 'Exo 2', system-ui, sans-serif",
              fontSize: 14,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              textShadow: '0 0 18px rgba(136, 92, 246, 0.42)',
            }}
          >
            $ONIX COIN
          </div>

          <button
            type="button"
            aria-label="Уведомления"
            style={{
              width: 34,
              height: 34,
              border: 0,
              padding: 0,
              margin: 0,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: '#FFFFFF',
              boxShadow: 'none',
              outline: 'none',
              justifySelf: 'end',
            }}
          >
            <Bell size={19} strokeWidth={2.1} />
          </button>
        </div>
      )}

      {activeTab !== 'home' && activeTab !== 'boosts' && activeTab !== 'friends' && (
        <>
      <div className="onix-rank-panel px-5 pt-4">
        <div className="flex justify-between mb-2">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400" />
            <span className="font-bold">Ранг {rankInfo.currentRank.name}</span>
          </div>

          <span className="text-sm text-gray-400">
            {rankInfo.nextRank
              ? `${rankProgressText} до ${rankInfo.nextRank.name}`
              : 'Максимальный ранг'}
          </span>
        </div>

        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="onix-progress-fill h-full transition-all"
            style={{ width: `${Math.min(rankProgress, 100)}%` }}
          />
        </div>
      </div>

      <div className="onix-balance-panel text-center pt-6 pb-4">
        <p className="text-gray-400 text-sm">Баланс $ONIX</p>

        <p className="onix-balance-number text-6xl font-black tracking-tighter">
          {balance.toLocaleString('ru-RU')}
        </p>

        {isBoostActive && (
          <p className="text-emerald-400 text-sm mt-1">⚡ Буст активен</p>
        )}
      </div>

        </>
      )}

      <div className="onix-nav flex">
        {[
          { id: 'home', label: 'Главная', icon: Home },
          { id: 'boosts', label: 'Улучшения', icon: Zap },
          { id: 'tasks', label: 'Задания', icon: Trophy },
          { id: 'friends', label: 'Профиль', icon: UserCircle },
          { id: 'wallet', label: 'Кошелёк', icon: Wallet },
          { id: 'launch', label: 'Запуск', icon: Rocket },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`min-w-[64px] flex-1 py-3 rounded-xl flex flex-col items-center gap-1 text-[11px] sm:text-sm transition-all ${
              activeTab === tab.id
                ? 'onix-nav-active'
                : ''
            }`}
          >
            <tab.icon className="w-5 h-5 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'home' && (
        <div className="onix-ref-v5-screen">
          <div className="onix-ref-v5-player">
            <div className="onix-ref-v5-player-left">
              <div className="onix-ref-v5-avatar">
                <img src={onixLogoCrystal} alt="$ONIX user badge" draggable={false} />
              </div>

              <div className="onix-ref-v5-player-text">
                <p className="onix-ref-v5-name">{username}</p>
                <p className="onix-ref-v5-rank">{selectedTitle || rankInfo.currentRank.name}</p>
              </div>
            </div>

            <div className="onix-ref-v5-rank-badge">
              <RankIcon rank={rankInfo.currentRank} size="md" />
            </div>
          </div>

          <div className="onix-ref-v5-balance">
            <p className="onix-ref-v5-balance-value">{balance.toLocaleString('ru-RU')}</p>
            <p className="onix-ref-v5-balance-label">Баланс $ONIX</p>
          </div>

          <button
            type="button"
            onClick={handleTap}
            className={`onix-ref-v5-coin ${isTapped ? 'onix-ref-v5-coin-tapped' : ''}`}
          >
            <img src={onixTapCrystal} alt="$ONIX tap crystal" draggable={false} />

            {floatingNumbers.map((num) => (
              <div
                key={num.id}
                className="onix-floating-number absolute text-3xl font-bold animate-float"
                style={{ left: num.x - 20, top: num.y - 30 }}
              >
                +{num.value}
              </div>
            ))}
          </button>

          <div className="onix-ref-v5-energy">
            <div className="onix-ref-v5-energy-text">
              <Zap className="onix-ref-v5-energy-icon" />
              <span><strong>{Math.floor(energy).toLocaleString('ru-RU')}</strong> / {maxEnergy.toLocaleString('ru-RU')}</span>
              <span className="onix-ref-v5-energy-status">{energy >= maxEnergy ? 'Энергия полная' : 'Восстановление'}</span>
            </div>

            <div className="onix-ref-v5-energy-track">
              <div
                className="onix-ref-v5-energy-fill"
                style={{ width: `${Math.min((energy / Math.max(maxEnergy, 1)) * 100, 100)}%` }}
              />
            </div>

            <button
              type="button"
              onClick={handleTap}
              className="onix-ref-v5-tap-button"
            >
              ⚡ ТАП!
            </button>
          </div>
        </div>
      )}

      {activeTab === 'launch' && (
        <div className="onix-launch-screen px-5 mt-8 space-y-5">
          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-6 text-left shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-3xl">
                🚀
              </div>

              <div>
                <h2 className="text-2xl font-black text-white">ONIX COIN</h2>
                <p className="text-sm text-gray-400">
                  Tap. Mine. Invite. Compete.
                </p>
              </div>
            </div>

            <p className="text-sm leading-6 text-gray-300">
              ONIX COIN — это Telegram Mini App, где игроки зарабатывают ONIX за
              тапы, майнинг, задания, команды, сезоны и приглашения друзей.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Игроков</p>
                <p className="mt-1 font-bold text-yellow-400">
                  {backendHealth?.users ?? '—'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Версия</p>
                <p className="mt-1 font-bold text-yellow-400">
                  v{appVersionInfo?.version || '1.0.0'}
                </p>
              </div>
            </div>

            <button
              onClick={shareReferralLink}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              📣 Пригласить в ONIX COIN
            </button>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-white">❓ FAQ</h3>

            <div className="space-y-3">
              {[
                {
                  q: 'Как заработать ONIX?',
                  a: 'Тапайте монету, забирайте оффлайн-майнинг, выполняйте задания, приглашайте друзей и участвуйте в сезонах.',
                },
                {
                  q: 'Как работает энергия?',
                  a: 'Каждый тап тратит энергию. Энергия восстанавливается со временем и улучшается через апгрейды.',
                },
                {
                  q: 'Как получить реферальный бонус?',
                  a: 'Новый игрок получает стартовый бонус. Пригласивший получает бонус после активности приглашённого игрока.',
                },
                {
                  q: 'Как работают сезоны?',
                  a: 'Каждую неделю считается рейтинг по заработанным ONIX. Лучшие игроки и команды получают призы.',
                },
                {
                  q: 'Можно ли вывести ONIX?',
                  a: 'Заявки на вывод доступны после достижения минимальной суммы. Перед выводом действует антибот-проверка.',
                },
              ].map((item) => (
                <div key={item.q} className="rounded-2xl bg-[#0a0f1c] p-4">
                  <p className="font-bold text-white">{item.q}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{item.a}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-white">🗺 Roadmap</h3>

            <div className="space-y-3">
              {[
                ['✅', 'Tap-to-earn core', 'Тапы, энергия, апгрейды и майнинг'],
                ['✅', 'Seasons & teams', 'Сезонные призы, команды и рейтинги'],
                ['✅', 'Growth tools', 'Промокоды, welcome bonus и share card'],
                ['🟡', 'Public beta', 'Тест с реальными игроками и балансировка экономики'],
                ['🔜', 'Listing preparation', 'Подготовка к будущему листингу и внешним интеграциям'],
              ].map(([icon, title, text]) => (
                <div key={title} className="flex gap-3 rounded-2xl bg-[#0a0f1c] p-4">
                  <div className="text-2xl">{icon}</div>
                  <div>
                    <p className="font-bold text-white">{title}</p>
                    <p className="mt-1 text-sm text-gray-400">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-white">📄 Privacy Policy / Terms</h3>

            <div className="space-y-3 text-sm leading-6 text-gray-400">
              <p>
                ONIX COIN использует Telegram ID, username и игровые действия
                только для работы приложения, рейтингов, прогресса, заданий,
                антиабуза и заявок на вывод.
              </p>

              <p>
                Запрещены боты, мультиаккаунты, накрутка рефералов, обход
                лимитов и любые попытки нарушить экономику игры.
              </p>

              <p>
                Администратор может заморозить подозрительный аккаунт, отклонить
                вывод или скорректировать баланс при нарушениях.
              </p>

              <p>
                ONIX внутри приложения является игровой единицей. Условия вывода
                и будущие интеграции могут изменяться во время публичного теста.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-gradient-to-br from-yellow-400/20 to-[#111827] p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 text-3xl">
              💎
            </div>

            <h3 className="text-2xl font-black text-white">Coming soon: listing</h3>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Публичный тест поможет проверить экономику, антиабуз и активность
              игроков перед следующими этапами развития ONIX COIN.
            </p>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <p className="text-xs text-gray-400">Статус</p>
              <p className="mt-1 font-bold text-yellow-400">
                Public beta preparation
              </p>
            </div>
          </div>
        </div>
      )}


      {activeTab === 'boosts' && (() => {
        const displayGems = 2450;

        const tappingCards = [
          {
            id: 'tap',
            icon: '👆',
            accent: 'violet',
            title: 'Сила тапа',
            level: tapLevel,
            subtitle: `${formatOnix(tapPower)} ONIX за тап`,
            price: nextTapCost,
            priceType: 'onix',
            disabled: balance < nextTapCost,
            action: () => buyUpgrade('tap'),
          },
          {
            id: 'miner',
            icon: '🪙',
            accent: 'gold',
            title: 'Множитель монеты',
            level: minerLevel,
            subtitle: `+${formatOnix(minerIncomePerSecond)} ONIX в сек`,
            price: nextMinerCost,
            priceType: 'onix',
            disabled: balance < nextMinerCost,
            action: () => buyUpgrade('miner'),
          },
          {
            id: 'recharge',
            icon: '⚡',
            accent: 'cyan',
            title: 'Восстановление энергии',
            level: rechargeLevel,
            subtitle: `+${formatOnix(energyRecharge)} энергии`,
            price: nextRechargeCost,
            priceType: 'onix',
            disabled: balance < nextRechargeCost,
            action: () => buyUpgrade('recharge'),
          },
          {
            id: 'energy',
            icon: '💎',
            accent: 'blue',
            title: 'Макс. энергия',
            level: energyLevel,
            subtitle: `${maxEnergy.toLocaleString('ru-RU')} max. энергии`,
            price: nextEnergyCost,
            priceType: 'onix',
            disabled: balance < nextEnergyCost,
            action: () => buyUpgrade('energy'),
          },
        ];

        const energySaverCost = energySaverLevel >= 3 ? 0 : getPerkCost(150000, energySaverLevel + 1);
        const energyMaxProCost = energyMaxProLevel >= 3 ? 0 : getPerkCost(175000, energyMaxProLevel + 1);
        const boostsMasterCost = boostMasterLevel >= 3 ? 0 : getPerkCost(180000, boostMasterLevel + 1);
        const dailyPlusCost = dailyPlusLevel >= 3 ? 0 : getPerkCost(200000, dailyPlusLevel + 1);
        const engineerCost = engineerLevel >= 3 ? 0 : getPerkCost(250000, engineerLevel + 1);
        const offlineProCost = offlineProLevel >= 3 ? 0 : getPerkCost(100000, offlineProLevel + 1);

        const energyCards = [
          {
            id: 'energy-main',
            icon: '🔋',
            accent: 'blue',
            title: 'Энергия',
            level: energyLevel,
            subtitle: `${maxEnergy.toLocaleString('ru-RU')} max. энергии`,
            price: nextEnergyCost,
            priceType: 'onix',
            disabled: balance < nextEnergyCost,
            action: () => buyUpgrade('energy'),
          },
          {
            id: 'recharge-main',
            icon: '⚡',
            accent: 'cyan',
            title: 'Восстановление',
            level: rechargeLevel,
            subtitle: `+${formatOnix(energyRecharge)} энергии/сек`,
            price: nextRechargeCost,
            priceType: 'onix',
            disabled: balance < nextRechargeCost,
            action: () => buyUpgrade('recharge'),
          },
          {
            id: 'energy-saver',
            icon: '🛡️',
            accent: 'violet',
            title: 'Energy Saver',
            level: energySaverLevel,
            subtitle: `-${energySaverLevel * 10}% расхода энергии`,
            price: energySaverCost,
            priceType: 'onix',
            disabled: energySaverLevel >= 3 || balance < energySaverCost,
            priceLabel: energySaverLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('energy_saver'),
          },
          {
            id: 'energy-max-pro',
            icon: '💠',
            accent: 'pink',
            title: 'Energy Max Pro',
            level: energyMaxProLevel,
            subtitle: `+${energyMaxProLevel * 500} бонус энергии`,
            price: energyMaxProCost,
            priceType: 'onix',
            disabled: energyMaxProLevel >= 3 || balance < energyMaxProCost,
            priceLabel: energyMaxProLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('energy_max_pro'),
          },
        ];

        const boostsCards = boostCards.map((boost) => ({
          id: boost.type,
          icon: boost.type === 'tap' ? '🚀' : '⚡',
          accent: boost.isActive ? 'emerald' : 'gold',
          title: boost.title,
          level: boost.isActive ? 1 : 0,
          subtitle: `${boost.multiplier} • ${boost.durationMinutes} мин${boost.isActive ? ` • ${boostTimeLeft}` : ''}`,
          price: boost.cost,
          priceType: 'onix',
          disabled: (isAnyBoostActive && !boost.isActive) || (!boost.isActive && balance < boost.cost),
          priceLabel: boost.isActive ? 'ACTIVE' : undefined,
          action: () => activateBoost(boost.type, boost.durationMinutes, boost.cost),
        }));

        const otherCards = [
          {
            id: 'offline-pro',
            icon: '🧲',
            accent: 'violet',
            title: 'Offline Pro',
            level: offlineProLevel,
            subtitle: `${maxOfflineHours} ч. оффлайн-дохода`,
            price: offlineProCost,
            priceType: 'onix',
            disabled: offlineProLevel >= 3 || balance < offlineProCost,
            priceLabel: offlineProLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('offline_pro'),
          },
          {
            id: 'daily-plus',
            icon: '🎁',
            accent: 'gold',
            title: 'Daily Plus',
            level: dailyPlusLevel,
            subtitle: `+${dailyPlusLevel * 10}% к daily reward`,
            price: dailyPlusCost,
            priceType: 'onix',
            disabled: dailyPlusLevel >= 3 || balance < dailyPlusCost,
            priceLabel: dailyPlusLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('daily_plus'),
          },
          {
            id: 'boost-master',
            icon: '🧪',
            accent: 'cyan',
            title: 'Boost Master',
            level: boostMasterLevel,
            subtitle: `+${boostMasterLevel * 20}% времени буста`,
            price: boostsMasterCost,
            priceType: 'onix',
            disabled: boostMasterLevel >= 3 || balance < boostsMasterCost,
            priceLabel: boostMasterLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('boost_master'),
          },
          {
            id: 'engineer',
            icon: '🛠️',
            accent: 'pink',
            title: 'Engineer',
            level: engineerLevel,
            subtitle: `-${engineerLevel * 5}% к цене апгрейдов`,
            price: engineerCost,
            priceType: 'onix',
            disabled: engineerLevel >= 3 || balance < engineerCost,
            priceLabel: engineerLevel >= 3 ? 'MAX' : undefined,
            action: () => buyPerk('engineer'),
          },
        ];

        const currentCards =
          boostSubTab === 'tapping'
            ? tappingCards
            : boostSubTab === 'energy'
            ? energyCards
            : boostSubTab === 'boosts'
            ? boostsCards
            : otherCards;

        return (
          <div className="onix-upgrades-ref-screen">
            <div className="onix-upgrades-ref-wallets">
              <div className="onix-upgrades-ref-wallet onix-upgrades-ref-wallet-onix">
                <div className="onix-upgrades-ref-wallet-icon">🪙</div>
                <div>
                  <div className="onix-upgrades-ref-wallet-value">
                    {Math.floor(balance).toLocaleString('ru-RU')}
                  </div>
                  <div className="onix-upgrades-ref-wallet-label">ONIX</div>
                </div>
              </div>

              <div className="onix-upgrades-ref-wallet onix-upgrades-ref-wallet-gems">
                <div className="onix-upgrades-ref-wallet-icon">💎</div>
                <div>
                  <div className="onix-upgrades-ref-wallet-value">
                    {displayGems.toLocaleString('ru-RU')}
                  </div>
                  <div className="onix-upgrades-ref-wallet-label">GEMS</div>
                </div>
              </div>
            </div>

            <div className="onix-upgrades-ref-tabs">
              {[
                { id: 'tapping', label: 'Таппинг' },
                { id: 'energy', label: 'Энергия' },
                { id: 'boosts', label: 'Бусты' },
                { id: 'other', label: 'Другое' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBoostSubTab(tab.id as BoostSubTab)}
                  className={`onix-upgrades-ref-tab ${boostSubTab === tab.id ? 'onix-upgrades-ref-tab-active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="onix-upgrades-ref-list">
              {currentCards.map((item) => (
                <div key={item.id} className="onix-upgrade-ref-card">
                  <div className={`onix-upgrade-ref-icon onix-upgrade-ref-icon-${item.accent}`}>
                    <span>{item.icon}</span>
                  </div>

                  <div className="onix-upgrade-ref-main">
                    <div className="onix-upgrade-ref-title">{item.title}</div>
                    <div className="onix-upgrade-ref-level">Уровень {item.level}</div>
                    <div className="onix-upgrade-ref-subtitle">{item.subtitle}</div>
                  </div>

                  <button
                    type="button"
                    onClick={item.action}
                    disabled={item.disabled}
                    className={`onix-upgrade-ref-buy ${item.disabled ? 'onix-upgrade-ref-buy-disabled' : ''}`}
                  >
                    <span className="onix-upgrade-ref-buy-icon">🪙</span>
                    <span>
                      {(item as any).priceLabel ? (item as any).priceLabel : item.price.toLocaleString('ru-RU')}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {activeTab === 'tasks' && (
        <div className="onix-tasks-screen px-5 mt-8 space-y-4">
          <h2 className="text-2xl font-bold mb-6">📋 Задания</h2>

          <div
            onClick={async () => {
              if (dailyCooldown > 0) return;

              try {
                const response = await axios.post(`${API_URL}/claim-task`, {
                  telegramId: getTelegramId(),
                  task: 'daily',
                });

                const user = response.data;
                const cooldown = DAY_MS;

                setBalance(user.balance);
                setUsername(user.username || 'Пользователь');
                setWeeklyEarned(Number(user.weeklyEarned || 0));
                setTotalEarned(user.totalEarned);
                setLevel(user.level);
                applyUserStats(user);
                setDailyStreak(Number(user.dailyStreak || 0));
                setTransactions(user.transactions || []);
                setDailyCooldown(cooldown);

                localStorage.setItem(
                  'dailyCooldownEnd',
                  (Date.now() + cooldown).toString()
                );

                showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);
                loadMissions();

                const rankBonusText =
                  Array.isArray(response.data.rankBonuses) && response.data.rankBonuses.length
                    ? `\n🏆 Бонус ранга: +${formatOnix(
                        response.data.rankBonuses.reduce(
                          (sum: number, item: { bonus: number }) =>
                            sum + Number(item.bonus || 0),
                          0
                        )
                      )} ONIX`
                    : '';

                showToast(
                  `🎁 Вы получили +${formatOnix(
                    response.data.claimedDailyReward ||
                      getDailyRewardWithStreak(user.level, user.dailyStreak || 1)
                  )} ONIX\n🔥 Стрик: ${user.dailyStreak || 1}/7${rankBonusText}`
                );
              } catch (error: any) {
                showToast(error?.response?.data?.message || 'Ошибка получения награды');
              }
            }}
            className={`shop-item ${
              dailyCooldown > 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div>
              <p className="font-bold">🎁 Ежедневная награда</p>
              <p className="text-gray-400">
                +{formatOnix(dailyRewardPreview)} ONIX · День {nextDailyStreakDay}/7
              </p>
              <p className="text-xs text-yellow-400">
                Множитель стрика ×{dailyStreakMultiplier.toFixed(1)}
              </p>
            </div>

            <span className="text-emerald-400 font-bold">
              {dailyCooldown > 0 ? formatTime(dailyCooldown) : 'Забрать'}
            </span>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">☀️ Ежедневные миссии</h3>
                <p className="text-sm text-gray-400">
                  Сложность ×{missions.difficulty}
                </p>
              </div>


            </div>

            <div className="space-y-3">
              {missions.daily.length > 0 ? (
                missions.daily.map((mission) => {
                  const progressPercent = Math.min(
                    (Number(mission.progress || 0) / Number(mission.goal || 1)) * 100,
                    100
                  );

                  return (
                    <div
                      key={mission.id}
                      className="rounded-2xl bg-[#0a0f1c] p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-white">
                            {mission.secret ? '🔒 ' : ''}{mission.title}
                          </p>
                          <p className="text-sm text-gray-400">
                            {mission.description}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#111827] px-3 py-2 text-right">
                          <p className="text-xs text-gray-400">Награда</p>
                          <p className="font-bold text-yellow-400">
                            +{formatOnix(mission.reward)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-gray-400">Прогресс</span>
                        <span className="font-bold text-emerald-400">
                          {formatOnix(mission.progress)} / {formatOnix(mission.goal)}
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <button
                        onClick={() => claimMission(mission, 'daily')}
                        disabled={!mission.isCompleted || mission.isClaimed}
                        className={`mt-3 w-full rounded-2xl py-3 font-bold ${
                          mission.isClaimed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : mission.isCompleted
                            ? 'bg-yellow-400 text-black active:scale-95'
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {mission.isClaimed
                          ? 'Получено'
                          : mission.isCompleted
                          ? 'Забрать'
                          : 'В процессе'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Миссии загружаются...
                </p>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">📅 Еженедельные миссии</h3>
                <p className="text-sm text-gray-400">
                  Секретные задания открываются по прогрессу
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {missions.weekly.length > 0 ? (
                missions.weekly.map((mission) => {
                  const progressPercent = Math.min(
                    (Number(mission.progress || 0) / Number(mission.goal || 1)) * 100,
                    100
                  );

                  return (
                    <div
                      key={mission.id}
                      className="rounded-2xl bg-[#0a0f1c] p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-white">
                            {mission.secret ? '🔒 ' : ''}{mission.title}
                          </p>
                          <p className="text-sm text-gray-400">
                            {mission.description}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#111827] px-3 py-2 text-right">
                          <p className="text-xs text-gray-400">Награда</p>
                          <p className="font-bold text-yellow-400">
                            +{formatOnix(mission.reward)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-gray-400">Прогресс</span>
                        <span className="font-bold text-emerald-400">
                          {formatOnix(mission.progress)} / {formatOnix(mission.goal)}
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>

                      <button
                        onClick={() => claimMission(mission, 'weekly')}
                        disabled={!mission.isCompleted || mission.isClaimed}
                        className={`mt-3 w-full rounded-2xl py-3 font-bold ${
                          mission.isClaimed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : mission.isCompleted
                            ? 'bg-yellow-400 text-black active:scale-95'
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {mission.isClaimed
                          ? 'Получено'
                          : mission.isCompleted
                          ? 'Забрать'
                          : 'В процессе'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Миссии загружаются...
                </p>
              )}
            </div>
          </div>

          <div
            onClick={async () => {
              if (completedTasks.includes('channel')) return;

              if (!channelJoined) {
                window.open('https://t.me/+LEfKu_gQS_o4YTVh', '_blank');
                localStorage.setItem('channelJoined', 'true');
                setChannelJoined(true);
                return;
              }

              try {
                const response = await axios.post(`${API_URL}/claim-task`, {
                  telegramId: getTelegramId(),
                  task: 'channel',
                });

                const user = response.data;

                setBalance(user.balance);
                setUsername(user.username || 'Пользователь');
                setWeeklyEarned(Number(user.weeklyEarned || 0));
                setTotalEarned(user.totalEarned);
                setLevel(user.level);
                applyUserStats(user);
                setCompletedTasks(user.completedTasks || []);
                setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));
                setTransactions(user.transactions || []);
                setAchievements(user.achievements || response.data.achievements || ACHIEVEMENTS);
                showRewardPopupFromResponse(response.data);
      showReferralBonusPaidToast(response.data);
                loadMissions();

                showToast('🎉 Подписка подтверждена! +25000 ONIX');
              } catch (error: any) {
                showToast(error?.response?.data?.message || 'Сначала подпишитесь на канал');
              }
            }}
            className={`shop-item ${
              completedTasks.includes('channel')
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            <div>
              <p className="font-bold">📢 Подписаться на канал</p>
              <p className="text-gray-400">+25000 ONIX</p>
            </div>

            <span className="text-emerald-400 font-bold">
              {completedTasks.includes('channel')
                ? 'Выполнено'
                : channelJoined
                ? 'Проверить'
                : 'Подписаться'}
            </span>
          </div>

          <div
            onClick={async () => {
              if (completedTasks.includes('inviteFriend')) return;

              if (referralsCount < 1) {
                setReferralModalVisible(true);
                return;
              }

              try {
                const response = await axios.post(`${API_URL}/claim-task`, {
                  telegramId: getTelegramId(),
                  task: 'inviteFriend',
                });

                const user = response.data;

                setBalance(user.balance);
                setUsername(user.username || 'Пользователь');
                setWeeklyEarned(Number(user.weeklyEarned || 0));
                setTotalEarned(user.totalEarned);
                setLevel(user.level);
                applyUserStats(user);
                setCompletedTasks(user.completedTasks || []);
                setOwnedPerks(user.ownedPerks || []);
      setPerkLevels(normalizePerkLevels(user.perkLevels));

                showToast(`🎉 Вы получили +${formatOnix(economyConfig.referralReward)} ONIX!`, 'success');
              } catch (error: any) {
                showToast(error?.response?.data?.message || 'Сначала пригласите друга');
              }
            }}
            className={`shop-item ${
              completedTasks.includes('inviteFriend')
                ? 'opacity-50 cursor-not-allowed'
                : ''
            }`}
          >
            <div>
              <p className="font-bold">👥 Пригласить друга</p>
              <p className="text-gray-400">+{formatOnix(economyConfig.referralReward)} ONIX</p>
              <p className="text-xs text-yellow-400">
                Бонусы сегодня: {referralLimit.used}/{referralLimit.max}
              </p>
            </div>

            <span className="text-emerald-400 font-bold">
              {completedTasks.includes('inviteFriend')
                ? 'Выполнено'
                : referralsCount >= 1
                ? 'Забрать'
                : 'Пригласить'}
            </span>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">🏆 Достижения</h2>
              <span className="rounded-full bg-[#111827] px-3 py-1 text-sm font-bold text-yellow-400">
                {completedAchievementsCount} / {achievements.length}
              </span>
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              {achievementCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setAchievementCategory(category.id)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${
                    achievementCategory === category.id
                      ? 'bg-yellow-400 text-black'
                      : 'bg-[#111827] text-gray-400'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>

            {visibleAchievements.length > 0 ? (
              <div className="space-y-4">
                {visibleAchievements.map((achievement) => {
                  const progressPercent = Math.min(
                    (Number(achievement.progress || 0) /
                      Number(achievement.goal || 1)) *
                      100,
                    100
                  );

                  return (
                    <div
                      key={achievement.id}
                      className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            {achievement.title}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {achievement.description}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-[#0a0f1c] px-3 py-2 text-right">
                          <p className="text-xs text-gray-400">Награда</p>
                          <p className="font-bold text-yellow-400">
                            +{formatOnix(achievement.reward)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-gray-400">Прогресс</span>
                        <span className="font-bold text-emerald-400">
                          {formatOnix(achievement.progress)} /{' '}
                          {formatOnix(achievement.goal)}
                        </span>
                      </div>

                      <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-center">
                <p className="text-lg font-bold text-emerald-400">
                  Все достижения выполнены 🎉
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Новые достижения появятся в будущих обновлениях.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {activeTab === 'friends' && (
        <div className="onix-social-screen px-5 mt-8 space-y-5">
          <div className="onix-profile-ref-screen">
            <div className="onix-profile-ref-head">
              <div className="onix-profile-ref-avatar">
                <RankIcon rank={rankInfo.currentRank} size="lg" />
              </div>

              <div className="onix-profile-ref-user">
                <div className="onix-profile-ref-name">{username}</div>
                <div className="onix-profile-ref-rank">{selectedTitle || rankInfo.currentRank.name}</div>
              </div>
            </div>

            <div className="onix-profile-ref-level">
              <div className="onix-profile-ref-level-row">
                <span>Уровень {profileLevel}</span>
                <span>
                  {formatOnix(totalEarned % 100000)} / 100 000 XP
                </span>
              </div>
              <div className="onix-profile-ref-progress">
                <div
                  className="onix-profile-ref-progress-fill"
                  style={{ width: `${profileLevelProgress}%` }}
                />
              </div>
            </div>

            <div className="onix-profile-ref-stats">
              <div className="onix-profile-ref-stat">
                <span>Баланс ONIX</span>
                <strong>{Math.floor(balance).toLocaleString('ru-RU')}</strong>
              </div>

              <div className="onix-profile-ref-stat">
                <span>Всего заработано</span>
                <strong>{Math.floor(totalEarned).toLocaleString('ru-RU')}</strong>
              </div>

              <div className="onix-profile-ref-stat">
                <span>Приглашено</span>
                <strong>{referralsCount}</strong>
              </div>

              <div className="onix-profile-ref-stat">
                <span>Команда</span>
                <strong>{teamName || 'ONIX Squad'}</strong>
              </div>
            </div>

            <div className="onix-profile-ref-menu">
              <button type="button" className="onix-profile-ref-menu-item">
                <span>🏆</span>
                <strong>Достижения</strong>
                <em>{completedAchievementsCount}/{achievements.length}</em>
                <b>›</b>
              </button>

              <button type="button" className="onix-profile-ref-menu-item">
                <span>🏅</span>
                <strong>Ранги</strong>
                <em>{rankInfo.currentRank.name}</em>
                <b>›</b>
              </button>

              <button type="button" className="onix-profile-ref-menu-item">
                <span>📊</span>
                <strong>Статистика</strong>
                <em>{formatOnix(totalTaps)} тапов</em>
                <b>›</b>
              </button>
            </div>
          </div>
          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 text-3xl">
              👤
            </div>

            <h2 className="text-2xl font-bold text-white">{username}</h2>

            <p className="mt-1 text-sm text-gray-400">{selectedTitle}</p>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Profile Level</p>
                  <p className="text-lg font-bold text-yellow-400">
                    Level {profileLevel}
                  </p>
                </div>

                <p className="text-xs text-gray-400">
                  {formatOnix(totalEarned % 100000)} / 100 000
                </p>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${profileLevelProgress}%` }}
                />
              </div>

            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">🏟 Лига</p>
                  <p className="mt-1 text-2xl font-bold text-yellow-400">
                    {getLeagueIcon(league)} {league}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] px-4 py-3 text-right">
                  <p className="text-xs text-gray-400">Сезон</p>
                  <p className="font-bold text-emerald-400">
                    {seasonSecondsLeft > 0 ? seasonTimeLeft : 'обновляется'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-bold text-white">🏅 Бейджи игрока</p>
                <span className="rounded-full bg-[#111827] px-3 py-1 text-xs font-bold text-yellow-400">
                  {profileBadges.length}
                </span>
              </div>

              {profileBadges.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {profileBadges.map((badge) => (
                    <div
                      key={badge.label}
                      className="rounded-2xl border border-yellow-400/20 bg-[#111827] p-3 text-center"
                    >
                      <p className="text-2xl">{badge.icon}</p>
                      <p className="mt-1 text-sm font-bold text-yellow-400">
                        {badge.label}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-[#111827] p-4 text-center">
                  <p className="text-sm font-bold text-gray-300">
                    Пока нет бейджей
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Получайте ранги, попадайте в топ и выполняйте достижения.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <p className="mb-3 text-sm font-bold text-white">🎖 Титул игрока</p>

              <div className="flex flex-wrap gap-2">
                {availableTitles.map((title) => (
                  <button
                    key={title}
                    onClick={() => selectProfileTitle(title)}
                    className={`rounded-full px-3 py-2 text-xs font-bold ${
                      selectedTitle === title
                        ? 'bg-yellow-400 text-black'
                        : 'bg-[#111827] text-gray-300'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400">Текущий ранг</p>
                  <p className="mt-1 text-xl font-bold text-yellow-400">
                    {rankInfo.currentRank.name}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-400">Бонус ранга</p>
                  <p className="mt-1 font-bold text-emerald-400">
                    +{formatOnix(currentRankBonus)} ONIX
                  </p>
                </div>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${Math.min(rankProgress, 100)}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {rankInfo.nextRank
                    ? `${rankProgressText} до ${rankInfo.nextRank.name}`
                    : 'Максимальный ранг'}
                </span>

                {rankInfo.nextRank && (
                  <span className="font-bold text-emerald-400">
                    +{formatOnix(nextRankBonus)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <p className="mb-3 text-sm font-bold text-white">👥 Команда игрока</p>

              <div className="flex gap-2">
                <input
                  value={teamNameInput}
                  onChange={(event) => setTeamNameInput(event.target.value)}
                  placeholder="Название команды"
                  className="min-w-0 flex-1 rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
                />

                <button
                  onClick={saveTeamName}
                  className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black active:scale-95"
                >
                  OK
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                Текущая команда: {teamName || 'не выбрана'}
              </p>
            </div>

            {teamSocialDashboard && teamName && (
              <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">🤝 Командная активность</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {teamSocialDashboard.team.members} участников · место {teamSocialDashboard.team.place ? `#${teamSocialDashboard.team.place}` : '—'}
                    </p>
                  </div>

                  <button
                    onClick={shareTeamInviteLink}
                    className="rounded-2xl bg-yellow-400 px-4 py-3 text-xs font-bold text-black active:scale-95"
                  >
                    Ссылка
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-[#111827] p-3">
                    <p className="text-xs text-gray-400">Неделя</p>
                    <p className="mt-1 text-sm font-bold text-yellow-400">
                      {formatOnix(teamSocialDashboard.team.weeklyEarned)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#111827] p-3">
                    <p className="text-xs text-gray-400">Тапы</p>
                    <p className="mt-1 text-sm font-bold text-yellow-400">
                      {teamSocialDashboard.team.totalTaps}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#111827] p-3">
                    <p className="text-xs text-gray-400">Приз</p>
                    <p className="mt-1 text-sm font-bold text-emerald-400">
                      +{formatOnix(teamSocialDashboard.teamPrize)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={claimTeamPrize}
                  disabled={!teamSocialDashboard.teamPrize}
                  className={`mt-3 w-full rounded-2xl py-3 font-bold ${
                    teamSocialDashboard.teamPrize
                      ? 'bg-yellow-400 text-black active:scale-95'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {teamSocialDashboard.teamPrize ? 'Забрать командный приз' : 'Команда вне призовой зоны'}
                </button>

                <div className="mt-4 space-y-3">
                  <p className="text-sm font-bold text-white">📋 Командные задания</p>

                  {teamSocialDashboard.teamMissions.map((mission) => {
                    const progressPercent = Math.min(
                      (Number(mission.progress || 0) / Number(mission.goal || 1)) * 100,
                      100
                    );

                    return (
                      <div key={mission.id} className="rounded-2xl bg-[#111827] p-3">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-white">{mission.title}</p>
                            <p className="text-xs text-gray-400">{mission.description}</p>
                          </div>

                          <p className="shrink-0 font-bold text-yellow-400">
                            +{formatOnix(mission.reward)}
                          </p>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className="h-full rounded-full bg-yellow-400"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-gray-400">
                            {formatOnix(mission.progress)} / {formatOnix(mission.goal)}
                          </span>

                          <button
                            onClick={() => claimTeamMission(mission)}
                            disabled={!mission.isCompleted || mission.isClaimed}
                            className={`rounded-full px-3 py-1 font-bold ${
                              mission.isClaimed
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : mission.isCompleted
                                ? 'bg-yellow-400 text-black'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {mission.isClaimed ? 'Получено' : mission.isCompleted ? 'Забрать' : 'В процессе'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Место в топе</p>
                <p className="mt-1 text-lg font-bold text-yellow-400">
                  {currentUserPlace ? `#${currentUserPlace}` : '—'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">За неделю</p>
                <p className="mt-1 text-lg font-bold text-yellow-400">
                  +{formatOnix(weeklyEarned)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">До конца сезона</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">
                  {seasonSecondsLeft > 0 ? seasonTimeLeft : 'обновляется'}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Всего заработано</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {formatOnix(totalEarned)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Рефералы</p>
                <p className="mt-1 text-lg font-bold text-white">
                  {referralsCount}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <h3 className="mb-3 text-lg font-bold text-white">📊 Статистика игрока</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Тапов</p>
                  <p className="font-bold text-yellow-400">{formatOnix(totalTaps)}</p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Апгрейдов</p>
                  <p className="font-bold text-yellow-400">{formatOnix(totalUpgradesBought)}</p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Бустов</p>
                  <p className="font-bold text-yellow-400">{formatOnix(totalBoostsUsed)}</p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Оффлайн-клеймов</p>
                  <p className="font-bold text-yellow-400">{formatOnix(offlineClaimsCount)}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-400">Реферальные бонусы сегодня</p>
                  <p className="mt-1 text-lg font-bold text-white">
                    {referralLimit.used} / {referralLimit.max}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-400">За друга</p>
                  <p className="mt-1 font-bold text-yellow-400">
                    +{formatOnix(economyConfig.referralReward)} ONIX
                  </p>
                </div>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${referralProgress}%` }}
                />
              </div>

              <p className="mt-3 text-sm text-gray-400">
                {referralLimit.isLimitReached
                  ? `Лимит исчерпан. Новые бонусы через ${referralResetTime}`
                  : `Осталось оплачиваемых приглашений: ${referralLimit.remaining}`}
              </p>
            </div>

            <button
              onClick={() => setReferralModalVisible(true)}
              className="mt-5 w-full bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-2xl text-lg active:scale-95 transition"
            >
              👥 Пригласить друга
            </button>
            <div className="mt-5 rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-white">🚀 Referral campaign</h3>
                  <p className="text-sm text-gray-400">
                    Приглашай друзей и делись результатом
                  </p>
                </div>

                <div className="rounded-2xl bg-[#0a0f1c] px-3 py-2 text-right">
                  <p className="text-xs text-gray-400">За друга</p>
                  <p className="font-bold text-yellow-400">
                    +{formatOnix(economyConfig.referralReward)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  onClick={claimWelcomeBonus}
                  className="rounded-2xl bg-[#0a0f1c] py-4 font-bold text-emerald-400 active:scale-95"
                >
                  🎁 Welcome bonus
                </button>

                <button
                  onClick={() => setPromoModalVisible(true)}
                  className="rounded-2xl bg-[#0a0f1c] py-4 font-bold text-yellow-400 active:scale-95"
                >
                  🎟 Промокод
                </button>

                <button
                  onClick={() => setShareCardVisible(true)}
                  className="rounded-2xl bg-[#0a0f1c] py-4 font-bold text-sky-400 active:scale-95"
                >
                  📣 Share card
                </button>
              </div>
            </div>


            {isAdmin() && (
              <button
                onClick={loadAdminPrizePreview}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-yellow-400 active:scale-95 disabled:opacity-50"
              >
                🛠 Админ: призы сезона
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={loadAdminWithdrawals}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-emerald-400 active:scale-95 disabled:opacity-50"
              >
                💸 Админ: заявки на вывод
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={loadSuspiciousUsers}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-red-400 active:scale-95 disabled:opacity-50"
              >
                🚨 Админ: suspicious
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={loadAdminEconomyDashboard}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-sky-400 active:scale-95 disabled:opacity-50"
              >
                📊 Админ: экономика
              </button>
            )}
{/* SECURITY_ADMIN_VISIBLE_BUTTONS_FIX */}

            {isAdmin() && (
              <button
                onClick={() => setAdminSearchVisible(true)}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-purple-400 active:scale-95 disabled:opacity-50"
              >
                🔎 Админ: поиск игрока
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={loadAdminSecurityLogs}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-orange-400 active:scale-95 disabled:opacity-50"
              >
                🧾 Админ: security logs
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={async () => {
                  try {
                    const response = await axios.get(`${API_URL}/health`);
                    setBackendHealth(response.data);
                  } catch {
                    setBackendHealth({ ok: false });
                  }

                  setLaunchChecklistVisible(true);
                }}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-emerald-400 active:scale-95 disabled:opacity-50"
              >
                🚀 Админ: launch checklist
              </button>
            )}

            {isAdmin() && (
              <button
                onClick={openAdmin2Panel}
                disabled={isAdminLoading}
                className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-fuchsia-400 active:scale-95 disabled:opacity-50"
              >
                🧰 Админ: 2.0
              </button>
            )}



          </div>


          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-white">👥 Рейтинг друзей</h3>

            {friendLeaderboard.length > 0 ? (
              <div className="space-y-3">
                {friendLeaderboard.map((friend) => (
                  <div
                    key={friend.telegramId}
                    className={`flex items-center justify-between rounded-2xl p-4 ${
                      friend.isMe ? 'bg-yellow-400/10 border border-yellow-400/30' : 'bg-[#0a0f1c]'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-white">
                        #{friend.place} {friend.username}
                      </p>
                      <p className="text-xs text-gray-500">
                        неделя +{formatOnix(friend.weeklyEarned)} · refs {friend.referralsCount}
                      </p>
                    </div>

                    <p className="font-bold text-yellow-400">
                      {formatOnix(friend.totalEarned)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#0a0f1c] p-5 text-center">
                <p className="font-bold text-gray-300">Пока нет друзей</p>
                <p className="mt-1 text-sm text-gray-500">
                  Пригласите игроков по ссылке, и они появятся здесь.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">🏆 Топ недели</h3>
                <p className="text-sm text-gray-400">
                  Заработано ONIX за текущую неделю
                </p>
              </div>

              <div className="text-right">
                {leaderboardWeek && (
                  <span className="rounded-full bg-[#0a0f1c] px-3 py-1 text-xs font-bold text-yellow-400">
                    {leaderboardWeek}
                  </span>
                )}

                <p className="mt-2 text-xs text-emerald-400">
                  До конца: {seasonSecondsLeft > 0 ? seasonTimeLeft : 'обновляется'}
                </p>
              </div>
            </div>


            <div className="mb-5 rounded-3xl border border-yellow-400/20 bg-[#0a0f1c] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-bold text-white">🎁 Призы сезона</h4>
                  <p className="text-sm text-gray-400">
                    Награды за топ-3 будут активированы позже
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-2xl">🥇</p>
                  <p className="mt-1 text-xs text-gray-400">1 место</p>
                  <p className="mt-1 text-sm font-bold text-yellow-400">
                    +250 000
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-2xl">🥈</p>
                  <p className="mt-1 text-xs text-gray-400">2 место</p>
                  <p className="mt-1 text-sm font-bold text-yellow-400">
                    +150 000
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-2xl">🥉</p>
                  <p className="mt-1 text-xs text-gray-400">3 место</p>
                  <p className="mt-1 text-sm font-bold text-yellow-400">
                    +75 000
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-lg">🎖</p>
                  <p className="mt-1 text-xs text-gray-400">4–10 место</p>
                  <p className="mt-1 text-sm font-bold text-yellow-400">
                    +25 000
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-lg">⭐</p>
                  <p className="mt-1 text-xs text-gray-400">11–50 место</p>
                  <p className="mt-1 text-sm font-bold text-yellow-400">
                    +5 000
                  </p>
                </div>
              </div>
            </div>

            {leaderboard.length > 0 ? (
              <div className="space-y-3">
                {leaderboard.slice(0, 10).map((item) => {
                  const isCurrentUser =
                    item.telegramId && item.telegramId === getTelegramId();

                  return (
                    <div
                      key={`${item.place}-${item.username}`}
                      className={`flex items-center justify-between gap-3 rounded-2xl p-3 ${
                        isCurrentUser
                          ? 'bg-yellow-400/10 ring-1 ring-yellow-400/40'
                          : 'bg-[#0a0f1c]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400 font-bold text-black">
                          {item.place}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">
                            {item.username}
                          </p>
                          <p className="text-xs text-gray-500">
                            за неделю {formatOnix(item.weeklyEarned)} ONIX
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 font-bold text-yellow-400">
                        +{formatOnix(item.weeklyEarned)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Пока нет данных для рейтинга. Начните зарабатывать ONIX.
              </p>
            )}
          </div>

          {teamLeaderboard.length > 0 && (
            <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
              <h3 className="mb-4 text-xl font-bold text-white">🏟 Топ команд</h3>

              <div className="space-y-3">
                {teamLeaderboard.map((team) => (
                  <div
                    key={team.teamName}
                    className="flex items-center justify-between rounded-2xl bg-[#0a0f1c] p-4"
                  >
                    <div>
                      <p className="font-bold text-white">
                        #{team.place} {team.teamName}
                      </p>
                      <p className="text-xs text-gray-500">
                        участников: {team.members}
                      </p>
                    </div>

                    <p className="font-bold text-yellow-400">
                      +{formatOnix(team.weeklyEarned)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 text-left shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-white">📜 История сезонов</h3>

            {seasonHistory.length > 0 ? (
              <div className="space-y-3">
                {seasonHistory.slice(0, 5).map((season) => (
                  <div key={season.week} className="rounded-2xl bg-[#0a0f1c] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="font-bold text-yellow-400">{season.week}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(season.awardedAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {season.winners.slice(0, 10).map((winner) => (
                        <div
                          key={`${season.week}-${winner.place}`}
                          className="flex items-center justify-between rounded-2xl bg-[#111827] px-3 py-2 text-sm"
                        >
                          <span className="font-bold text-white">
                            #{winner.place} {winner.username}
                          </span>

                          <span className="font-bold text-yellow-400">
                            +{formatOnix(winner.prize)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#0a0f1c] p-5 text-center">
                <p className="font-bold text-gray-300">
                  Пока нет завершённых сезонов
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  После первой выдачи сезонных призов здесь появятся победители.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'wallet' && (
        <div className="onix-wallet-screen px-5 mt-8 space-y-5">
          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-3xl">
                💼
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white">Кошелёк</h2>
                <p className="text-sm text-gray-400">
                  Баланс, выводы и экономика аккаунта
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0a0f1c] p-5 text-center">
              <p className="text-sm text-gray-400">Текущий баланс</p>
              <p className="mt-2 text-5xl font-bold text-yellow-400">
                {formatOnix(balance)}
              </p>
              <p className="mt-2 text-lg font-bold text-emerald-400">
                ≈ {balanceInEur.toLocaleString('ru-RU', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} €
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Всего заработано</p>
                <p className="mt-1 text-sm font-bold text-yellow-400">
                  {formatOnix(totalEarned)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">За неделю</p>
                <p className="mt-1 text-sm font-bold text-emerald-400">
                  +{formatOnix(weeklyEarned)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Доходы в истории</p>
                <p className="mt-1 text-sm font-bold text-emerald-400">
                  +{formatOnix(walletIncomeTotal)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Расходы в истории</p>
                <p className="mt-1 text-sm font-bold text-red-400">
                  -{formatOnix(walletExpenseTotal)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Курс</p>
                <p className="mt-1 text-sm font-bold text-white">
                  1000 ONIX = {economyConfig.onixEurPer1000.toLocaleString('ru-RU')}€
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Минимальный вывод</p>
                <p className="mt-1 text-sm font-bold text-yellow-400">
                  {minWithdrawOnix.toLocaleString('ru-RU')} ONIX
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-400">Прогресс до вывода</span>
                <span className="font-bold text-yellow-400">
                  {withdrawProgress.toFixed(1)}%
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${withdrawProgress}%` }}
                />
              </div>

              <p className="mt-3 text-sm text-gray-400">
                {canWithdraw
                  ? 'Минимальная сумма набрана'
                  : `Осталось ${formatOnix(leftToWithdraw)} ONIX`}
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Pending-заявки: {formatOnix(walletPendingWithdrawal)} ONIX
              </p>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <p className="text-sm font-bold text-white">🛡 Антибот-проверка</p>
              <p className="mt-1 text-xs text-gray-500">
                Перед созданием заявки введите ONIX.
              </p>

              <input
                value={withdrawalCheck}
                onChange={(event) => setWithdrawalCheck(event.target.value)}
                placeholder="Введите ONIX"
                className="mt-3 w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
              />
            </div>

            <button
              onClick={requestWithdrawal}
              disabled={!canWithdraw || isWithdrawalLoading}
              className={`mt-5 w-full rounded-2xl py-4 text-lg font-bold active:scale-95 ${
                canWithdraw
                  ? 'bg-yellow-400 text-black'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isWithdrawalLoading
                ? 'Создаём заявку...'
                : canWithdraw
                ? 'Создать заявку на вывод'
                : 'Недостаточно ONIX для вывода'}
            </button>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl">
            <h3 className="text-xl font-bold text-white">📈 График заработка</h3>
            <p className="mt-1 text-sm text-gray-400">Доходы за последние 7 дней</p>

            <div className="mt-5 flex h-40 items-end gap-2 rounded-2xl bg-[#0a0f1c] p-4">
              {earningChartDays.map((item) => (
                <div key={item.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-xl bg-yellow-400 transition-all"
                      style={{
                        height: `${Math.max((item.amount / maxChartAmount) * 100, item.amount > 0 ? 8 : 2)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl">
            <h3 className="text-xl font-bold text-white">💸 Заявки на вывод</h3>

            {withdrawalRequests.length > 0 ? (
              <div className="mt-4 space-y-3">
                {withdrawalRequests.slice(0, 5).map((request, index) => (
                  <div
                    key={`${request.createdAt}-${index}`}
                    className="rounded-2xl bg-[#0a0f1c] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">
                          {formatOnix(request.amount)} ONIX
                        </p>
                        <p className="text-xs text-gray-400">
                          ≈ {formatOnix(request.eurAmount)} €
                        </p>
                        {request.adminComment && (
                          <p className="mt-1 text-xs text-gray-500">
                            {request.adminComment}
                          </p>
                        )}
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          request.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : request.status === 'rejected'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-yellow-400/10 text-yellow-400'
                        }`}
                      >
                        {request.status === 'approved'
                          ? 'Одобрено'
                          : request.status === 'rejected'
                          ? 'Отклонено'
                          : 'В обработке'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-[#0a0f1c] p-5 text-center">
                <p className="font-bold text-gray-300">Заявок пока нет</p>
                <p className="mt-1 text-sm text-gray-500">
                  Когда вы создадите заявку, она появится здесь.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-[#111827] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">🧾 История операций</h3>
                <p className="text-sm text-gray-400">
                  {filteredTransactions.length} операций
                </p>
              </div>
            </div>

            <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
              {transactionFilters.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setTransactionFilter(filter.id)}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${
                    transactionFilter === filter.id
                      ? 'bg-yellow-400 text-black'
                      : 'bg-[#0a0f1c] text-gray-400'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {filteredTransactions.length > 0 ? (
              <div className="space-y-3">
                {filteredTransactions.slice(0, 40).map((transaction, index) => {
                  const isIncome = Number(transaction.amount || 0) >= 0;

                  return (
                    <div
                      key={`${transaction.createdAt || index}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#0a0f1c] p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#111827] text-xl">
                          {getTransactionIcon(transaction.type)}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            {transaction.title || 'Операция'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatTransactionTime(transaction.createdAt)}
                          </p>
                        </div>
                      </div>

                      <p
                        className={`shrink-0 text-sm font-bold ${
                          isIncome ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {isIncome ? '+' : ''}
                        {formatOnix(transaction.amount)} ONIX
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#0a0f1c] p-5 text-center">
                <p className="font-bold text-gray-300">Операций нет</p>
                <p className="mt-1 text-sm text-gray-500">
                  Попробуйте выбрать другой фильтр.
                </p>
              </div>
            )}
          </div>
        </div>
      )}












      {promoModalVisible && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🎟 Промокод</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Введите промокод кампании
                </p>
              </div>

              <button
                onClick={() => setPromoModalVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <input
              value={promoCodeInput}
              onChange={(event) => setPromoCodeInput(event.target.value.toUpperCase())}
              placeholder="Например: LAUNCH"
              className="w-full rounded-2xl bg-[#0a0f1c] px-4 py-4 text-center text-lg font-bold text-white outline-none"
            />

            <button
              onClick={applyPromoCode}
              className="mt-4 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              Активировать
            </button>

            <p className="mt-3 text-center text-xs text-gray-500">
              Промокод можно использовать только один раз.
            </p>
          </div>
        </div>
      )}

      {shareCardVisible && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-sky-400/30 bg-[#111827] p-6 text-center shadow-2xl">
            <button
              onClick={() => setShareCardVisible(false)}
              className="ml-auto block text-2xl text-gray-400"
            >
              ×
            </button>

            <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl">
              🔗
            </div>

            <h2 className="mt-4 text-3xl font-black text-white">ONIX COIN</h2>
            <p className="mt-2 text-sm text-gray-400">Мой результат</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Баланс</p>
                <p className="font-bold text-yellow-400">{formatOnix(balance)}</p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Всего</p>
                <p className="font-bold text-yellow-400">{formatOnix(totalEarned)}</p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Ранг</p>
                <p className="font-bold text-yellow-400">{rankInfo.currentRank.name}</p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Топ</p>
                <p className="font-bold text-yellow-400">
                  {currentUserPlace ? `#${currentUserPlace}` : '—'}
                </p>
              </div>
            </div>

            <button
              onClick={shareReferralLink}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              Поделиться в Telegram
            </button>
          </div>
        </div>
      )}

      {launchChecklistVisible && (
        <div className="fixed inset-0 z-[89] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-emerald-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🚀 Публичный запуск</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Быстрая проверка перед релизом
                </p>
              </div>

              <button
                onClick={() => setLaunchChecklistVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {[
                {
                  title: 'Backend health',
                  ok: Boolean(backendHealth?.ok),
                  text: backendHealth?.ok
                    ? `OK · users: ${backendHealth.users || 0}`
                    : 'Проверь Render logs',
                },
                {
                  title: 'Telegram Mini App',
                  ok: true,
                  text: 'Проверить кнопку запуска и /start',
                },
                {
                  title: 'Кошелёк и вывод',
                  ok: true,
                  text: 'Проверить создание заявки и админку вывода',
                },
                {
                  title: 'Рефералка',
                  ok: true,
                  text: 'Проверить: +15 000 новому, +75 000 после 100 тапов',
                },
                {
                  title: 'Cron сезона',
                  ok: true,
                  text: 'GitHub Actions / cron должен вызывать weekly prizes',
                },
                {
                  title: 'Антиабуз',
                  ok: true,
                  text: 'Проверить suspicious, ban/unban и security logs',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl bg-[#0a0f1c] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-white">{item.title}</p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        item.ok
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {item.ok ? 'OK' : 'CHECK'}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-400">{item.text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setLaunchChecklistVisible(false)}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              Готово
            </button>
          </div>
        </div>
      )}


      {admin2Visible && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-fuchsia-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🧰 Админка 2.0</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Economy config, рассылки, CSV и операции
                </p>
              </div>

              <button
                onClick={() => setAdmin2Visible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="mb-5 rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">🛡 Production stability</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Frontend</p>
                  <p className="font-bold text-yellow-400">
                    v{'1.0.0'}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Backend</p>
                  <p className="font-bold text-yellow-400">
                    v{appVersionInfo?.version || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  onClick={downloadMongoBackup}
                  className="rounded-2xl bg-[#111827] py-3 font-bold text-emerald-400 active:scale-95"
                >
                  Backup JSON
                </button>

                <button
                  onClick={loadAdminFrontendErrors}
                  disabled={isAdminLoading}
                  className="rounded-2xl bg-[#111827] py-3 font-bold text-red-400 active:scale-95 disabled:opacity-50"
                >
                  Error logs
                </button>
              </div>

              {adminFrontendErrors.length > 0 && (
                <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                  {adminFrontendErrors.slice(0, 6).map((error, index) => (
                    <div
                      key={`${error.telegramId}-${error.createdAt}-${index}`}
                      className="rounded-xl bg-[#111827] p-3 text-xs"
                    >
                      <p className="font-bold text-red-400">{error.message}</p>
                      <p className="mt-1 text-gray-500">
                        {error.username} · v{error.appVersion || '—'} · {formatTransactionTime(error.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">⚙️ Economy config</h3>

              <div className="grid grid-cols-2 gap-2">
                {[
                  ['ONIX_EUR_PER_1000', 'Курс /1000'],
                  ['MIN_WITHDRAW_ONIX', 'Мин. вывод'],
                  ['REFERRAL_REWARD', 'Реферал'],
                  ['REFERRED_USER_REWARD', 'Новый игрок'],
                  ['WELCOME_BONUS', 'Welcome'],
                  ['CHEST_COST', 'Сундук'],
                  ['MAX_PAID_REFERRALS_PER_DAY', 'Реф/день'],
                  ['MAX_PAID_REFERRALS_PER_HOUR', 'Реф/час'],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs text-gray-400">
                    {label}
                    <input
                      value={adminEconomyConfigDraft[key] || ''}
                      onChange={(event) =>
                        setAdminEconomyConfigDraft((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl bg-[#111827] px-3 py-2 text-sm font-bold text-white outline-none"
                    />
                  </label>
                ))}
              </div>

              <button
                onClick={saveAdminEconomyConfig}
                disabled={isAdminLoading}
                className="mt-4 w-full rounded-2xl bg-yellow-400 py-3 font-bold text-black active:scale-95 disabled:opacity-50"
              >
                Сохранить runtime config
              </button>

              <p className="mt-2 text-xs text-gray-500">
                Runtime config работает до перезапуска backend. Для постоянных значений используй Render Environment.
              </p>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">📣 Массовая рассылка</h3>

              <textarea
                value={adminBroadcastMessage}
                onChange={(event) => setAdminBroadcastMessage(event.target.value)}
                placeholder="Текст сообщения игрокам"
                className="h-28 w-full resize-none rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
              />

              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  onClick={() => sendAdminBroadcast(true)}
                  disabled={isAdminLoading}
                  className="rounded-2xl bg-[#111827] py-3 font-bold text-sky-400 active:scale-95 disabled:opacity-50"
                >
                  Dry run
                </button>

                <button
                  onClick={() => sendAdminBroadcast(false)}
                  disabled={isAdminLoading}
                  className="rounded-2xl bg-yellow-400 py-3 font-bold text-black active:scale-95 disabled:opacity-50"
                >
                  Отправить
                </button>
              </div>

              {adminBroadcastResult && (
                <p className="mt-3 rounded-xl bg-[#111827] p-3 text-xs text-gray-300">
                  Получателей: {adminBroadcastResult.recipients || 0} ·
                  отправлено: {adminBroadcastResult.sent || 0} ·
                  ошибок: {adminBroadcastResult.failed || 0}
                </p>
              )}
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">📦 Экспорт и операции</h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={downloadUsersCsv}
                  className="rounded-2xl bg-[#111827] py-3 font-bold text-emerald-400 active:scale-95"
                >
                  CSV users
                </button>

                <button
                  onClick={loadAdminOperations}
                  disabled={isAdminLoading}
                  className="rounded-2xl bg-[#111827] py-3 font-bold text-yellow-400 active:scale-95 disabled:opacity-50"
                >
                  Обновить
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Выводы</p>
                  <p className="font-bold text-yellow-400">
                    {adminOperations?.withdrawals?.length || 0}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#111827] p-3">
                  <p className="text-xs text-gray-400">Транзакции</p>
                  <p className="font-bold text-yellow-400">
                    {adminOperations?.transactions?.length || 0}
                  </p>
                </div>
              </div>

              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {(adminOperations?.withdrawals || []).slice(0, 8).map((item, index) => (
                  <div
                    key={`${item.telegramId}-${item.createdAt}-${index}`}
                    className="rounded-xl bg-[#111827] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-white">{item.username}</p>
                      <p className="font-bold text-yellow-400">
                        {formatOnix(item.amount)} ONIX
                      </p>
                    </div>
                    <p className="mt-1 text-gray-500">
                      {item.status} · {formatTransactionTime(item.createdAt)}
                    </p>
                  </div>
                ))}

                {(adminOperations?.transactions || []).slice(0, 8).map((item, index) => (
                  <div
                    key={`${item.telegramId}-${item.createdAt}-${index}`}
                    className="rounded-xl bg-[#111827] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-white">{item.username}</p>
                      <p className={Number(item.amount || 0) >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-red-400'}>
                        {Number(item.amount || 0) >= 0 ? '+' : ''}
                        {formatOnix(item.amount)}
                      </p>
                    </div>
                    <p className="mt-1 text-gray-500">
                      {item.title || item.type} · {formatTransactionTime(item.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {adminSearchVisible && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-purple-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🔎 Админ: поиск игрока</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Поиск по username или Telegram ID
                </p>
              </div>

              <button
                onClick={() => setAdminSearchVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={adminSearchQuery}
                onChange={(event) => setAdminSearchQuery(event.target.value)}
                placeholder="username или telegramId"
                className="min-w-0 flex-1 rounded-2xl bg-[#0a0f1c] px-4 py-3 text-sm text-white outline-none"
              />

              <button
                onClick={searchAdminUsers}
                disabled={isAdminLoading}
                className="rounded-2xl bg-yellow-400 px-4 py-3 font-bold text-black active:scale-95 disabled:opacity-50"
              >
                Найти
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {adminSearchResults.length > 0 ? (
                adminSearchResults.map((user) => (
                  <button
                    key={user.telegramId}
                    onClick={() => loadAdminUserProfile(user.telegramId)}
                    className="w-full rounded-2xl bg-[#0a0f1c] p-4 text-left active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{user.username}</p>
                        <p className="text-xs text-gray-500">ID: {user.telegramId}</p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          user.isFrozen
                            ? 'bg-red-500/10 text-red-400'
                            : user.isSuspicious
                            ? 'bg-yellow-400/10 text-yellow-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {user.isFrozen ? 'Banned' : user.isSuspicious ? 'Suspicious' : 'OK'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <p className="rounded-xl bg-[#111827] p-2">
                        Balance: {formatOnix(user.balance)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Earned: {formatOnix(user.totalEarned)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Введите запрос и нажмите “Найти”
                </p>
              )}
            </div>

            {adminSelectedUser && (
              <div className="mt-5 rounded-3xl border border-yellow-400/20 bg-[#0a0f1c] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {adminSelectedUser.username}
                    </h3>
                    <p className="text-xs text-gray-500">
                      ID: {adminSelectedUser.telegramId}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      adminSelectedUser.isFrozen
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}
                  >
                    {adminSelectedUser.isFrozen ? 'Banned' : 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <p className="rounded-xl bg-[#111827] p-2">
                    Balance: {formatOnix(adminSelectedUser.balance)}
                  </p>
                  <p className="rounded-xl bg-[#111827] p-2">
                    Earned: {formatOnix(adminSelectedUser.totalEarned)}
                  </p>
                  <p className="rounded-xl bg-[#111827] p-2">
                    Week: {formatOnix(adminSelectedUser.weeklyEarned)}
                  </p>
                  <p className="rounded-xl bg-[#111827] p-2">
                    Taps: {adminSelectedUser.totalTaps}
                  </p>
                  <p className="rounded-xl bg-[#111827] p-2">
                    Refs: {adminSelectedUser.referralsCount}
                  </p>
                  <p className="rounded-xl bg-[#111827] p-2">
                    Upgrades: {adminSelectedUser.totalUpgradesBought}
                  </p>
                </div>

                {adminSelectedUser.suspiciousReasons.length > 0 && (
                  <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-400">
                    {adminSelectedUser.suspiciousReasons.join(', ')}
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  <input
                    value={adminAdjustAmount}
                    onChange={(event) => setAdminAdjustAmount(event.target.value)}
                    placeholder="+10000 или -10000"
                    className="w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
                  />

                  <input
                    value={adminActionReason}
                    onChange={(event) => setAdminActionReason(event.target.value)}
                    placeholder="Причина действия"
                    className="w-full rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={adjustAdminUserBalance}
                    disabled={isAdminLoading}
                    className="rounded-2xl bg-yellow-400 py-3 font-bold text-black active:scale-95 disabled:opacity-50"
                  >
                    Баланс
                  </button>

                  <button
                    onClick={toggleAdminUserBan}
                    disabled={isAdminLoading}
                    className={`rounded-2xl py-3 font-bold active:scale-95 disabled:opacity-50 ${
                      adminSelectedUser.isFrozen
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {adminSelectedUser.isFrozen ? 'Разбан' : 'Бан'}
                  </button>
                </div>

                <div className="mt-5">
                  <h4 className="mb-3 font-bold text-white">📝 Админские заметки</h4>

                  <div className="flex gap-2">
                    <input
                      value={adminNoteText}
                      onChange={(event) => setAdminNoteText(event.target.value)}
                      placeholder="Заметка по игроку"
                      className="min-w-0 flex-1 rounded-2xl bg-[#111827] px-4 py-3 text-sm text-white outline-none"
                    />

                    <button
                      onClick={addAdminNote}
                      disabled={isAdminLoading}
                      className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-bold text-black active:scale-95 disabled:opacity-50"
                    >
                      OK
                    </button>
                  </div>

                  <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                    {adminSelectedUser.adminNotes?.length > 0 ? (
                      adminSelectedUser.adminNotes.slice(0, 5).map((note, index) => (
                        <div
                          key={`${note.createdAt}-${index}`}
                          className="rounded-xl bg-[#111827] p-3 text-xs"
                        >
                          <p className="text-gray-300">{note.text}</p>
                          <p className="mt-1 text-gray-600">
                            {formatTransactionTime(note.createdAt)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl bg-[#111827] p-3 text-center text-xs text-gray-500">
                        Заметок пока нет
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5">
                  <h4 className="mb-3 font-bold text-white">🧾 Security logs</h4>

                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {adminSelectedUser.securityLogs.length > 0 ? (
                      adminSelectedUser.securityLogs.slice(0, 10).map((log, index) => (
                        <div
                          key={`${log.createdAt}-${index}`}
                          className="rounded-xl bg-[#111827] p-3 text-xs"
                        >
                          <p className="font-bold text-yellow-400">{log.title}</p>
                          <p className="mt-1 text-gray-400">{log.details}</p>
                          <p className="mt-1 text-gray-600">
                            {formatTransactionTime(log.createdAt)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl bg-[#111827] p-3 text-center text-xs text-gray-500">
                        Логов пока нет
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {adminSecurityLogsVisible && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-orange-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🧾 Security logs</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Последние подозрительные и админские действия
                </p>
              </div>

              <button
                onClick={() => setAdminSecurityLogsVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {adminSecurityLogs.length > 0 ? (
                adminSecurityLogs.map((log, index) => (
                  <div
                    key={`${log.telegramId}-${log.createdAt}-${index}`}
                    className="rounded-2xl bg-[#0a0f1c] p-4"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{log.username}</p>
                        <p className="text-xs text-gray-500">ID: {log.telegramId}</p>
                      </div>

                      <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-400">
                        {log.type}
                      </span>
                    </div>

                    <p className="font-bold text-yellow-400">{log.title}</p>
                    <p className="mt-1 text-sm text-gray-400">{log.details}</p>
                    <p className="mt-2 text-xs text-gray-600">
                      {formatTransactionTime(log.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Логов пока нет
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tutorialVisible && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl">
              {tutorialSteps[tutorialStep].icon}
            </div>

            <h2 className="text-2xl font-bold text-white">
              {tutorialSteps[tutorialStep].title}
            </h2>

            <p className="mt-3 text-sm leading-6 text-gray-400">
              {tutorialSteps[tutorialStep].text}
            </p>

            <div className="mt-5 flex justify-center gap-2">
              {tutorialSteps.map((_, index) => (
                <span
                  key={index}
                  className={`h-2 rounded-full transition-all ${
                    index === tutorialStep
                      ? 'w-8 bg-yellow-400'
                      : 'w-2 bg-gray-700'
                  }`}
                />
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={closeTutorial}
                className="rounded-2xl bg-[#0a0f1c] py-4 font-bold text-gray-300 active:scale-95"
              >
                Пропустить
              </button>

              <button
                onClick={() => {
                  if (tutorialStep >= tutorialSteps.length - 1) {
                    closeTutorial();
                  } else {
                    setTutorialStep((step) => step + 1);
                  }
                }}
                className="rounded-2xl bg-yellow-400 py-4 font-bold text-black active:scale-95"
              >
                {tutorialStep >= tutorialSteps.length - 1 ? 'Начать' : 'Дальше'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adminEconomyVisible && adminEconomyDashboard && (
        <div className="fixed inset-0 z-[87] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-sky-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">📊 Админ: dashboard экономики</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Общая экономика ONIX COIN
                </p>
              </div>

              <button
                onClick={() => setAdminEconomyVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Пользователи</p>
                <p className="font-bold text-yellow-400">
                  {adminEconomyDashboard.totals.users}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Баланс всех</p>
                <p className="font-bold text-yellow-400">
                  {formatOnix(adminEconomyDashboard.totals.totalBalance)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Создано ONIX</p>
                <p className="font-bold text-emerald-400">
                  +{formatOnix(adminEconomyDashboard.totals.createdOnix)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Потрачено ONIX</p>
                <p className="font-bold text-red-400">
                  -{formatOnix(adminEconomyDashboard.totals.spentOnix)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Pending выводы</p>
                <p className="font-bold text-yellow-400">
                  {adminEconomyDashboard.totals.pendingWithdrawals}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Сумма pending</p>
                <p className="font-bold text-yellow-400">
                  {formatOnix(adminEconomyDashboard.totals.pendingWithdrawOnix)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Suspicious</p>
                <p className="font-bold text-red-400">
                  {adminEconomyDashboard.totals.suspiciousUsers}
                </p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Frozen</p>
                <p className="font-bold text-red-400">
                  {adminEconomyDashboard.totals.frozenUsers}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">⚙️ Backend config</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <p>Курс: 1000 ONIX = {adminEconomyDashboard.economyConfig.onixEurPer1000}€</p>
                <p>Мин. вывод: {formatOnix(adminEconomyDashboard.economyConfig.minWithdrawOnix)} ONIX</p>
                <p>Реферал: +{formatOnix(adminEconomyDashboard.economyConfig.referralReward)} ONIX</p>
                <p>Сундук: {formatOnix(adminEconomyDashboard.economyConfig.chestCost)} ONIX</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4">
              <h3 className="mb-3 font-bold text-white">🧾 Типы операций</h3>
              <div className="space-y-2">
                {adminEconomyDashboard.transactionTypes.slice(0, 8).map((item) => (
                  <div
                    key={item.type}
                    className="flex items-center justify-between rounded-xl bg-[#111827] px-3 py-2 text-sm"
                  >
                    <span className="truncate text-gray-300">{item.type}</span>
                    <span className="font-bold text-yellow-400">
                      {formatOnix(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={loadAdminEconomyDashboard}
              disabled={isAdminLoading}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95 disabled:opacity-50"
            >
              Обновить dashboard
            </button>
          </div>
        </div>
      )}

      {seasonPrizePopup && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/40 bg-[#111827] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl">
              🏆
            </div>

            <h2 className="text-2xl font-bold text-white">
              Приз сезона получен
            </h2>

            <p className="mt-2 text-sm text-gray-400">
              Неделя {seasonPrizePopup.week}
            </p>

            <p className="mt-4 text-lg font-bold text-yellow-400">
              #{seasonPrizePopup.place} место
            </p>

            <p className="mt-2 text-3xl font-black text-yellow-400">
              +{formatOnix(seasonPrizePopup.prize)} ONIX
            </p>

            <button
              onClick={() => setSeasonPrizePopup(null)}
              className="mt-6 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              Забрать
            </button>
          </div>
        </div>
      )}

      {suspiciousUsersVisible && (
        <div className="fixed inset-0 z-[86] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-red-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">🚨 Suspicious users</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Подозрительные и замороженные аккаунты
                </p>
              </div>

              <button
                onClick={() => setSuspiciousUsersVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {suspiciousUsers.length > 0 ? (
                suspiciousUsers.map((user) => (
                  <div key={user.telegramId} className="rounded-2xl bg-[#0a0f1c] p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{user.username}</p>
                        <p className="text-xs text-gray-500">ID: {user.telegramId}</p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          user.isFrozen
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-yellow-400/10 text-yellow-400'
                        }`}
                      >
                        {user.isFrozen ? 'Frozen' : 'Suspicious'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <p className="rounded-xl bg-[#111827] p-2">
                        Balance: {formatOnix(user.balance)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Earned: {formatOnix(user.totalEarned)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Week: {formatOnix(user.weeklyEarned)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Refs: {user.referralsCount}
                      </p>
                    </div>

                    {user.suspiciousReasons.length > 0 && (
                      <p className="mt-3 rounded-xl bg-red-500/10 p-2 text-xs text-red-400">
                        {user.suspiciousReasons.join(', ')}
                      </p>
                    )}

                    <button
                      onClick={() => toggleFreezeUser(user)}
                      disabled={isAdminLoading}
                      className={`mt-4 w-full rounded-2xl py-3 font-bold active:scale-95 disabled:opacity-50 ${
                        user.isFrozen
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {user.isFrozen ? 'Разморозить' : 'Заморозить'}
                    </button>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Подозрительных аккаунтов нет
                </p>
              )}
            </div>

            <button
              onClick={loadSuspiciousUsers}
              disabled={isAdminLoading}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95 disabled:opacity-50"
            >
              Обновить список
            </button>
          </div>
        </div>
      )}

      {adminWithdrawalsVisible && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">💸 Админ: выводы</h2>
                <p className="mt-1 text-sm text-gray-400">Pending-заявки игроков</p>
              </div>

              <button
                onClick={() => setAdminWithdrawalsVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <textarea
              value={adminWithdrawalComment}
              onChange={(event) => setAdminWithdrawalComment(event.target.value)}
              placeholder="Комментарий админа"
              className="mb-4 h-24 w-full rounded-2xl bg-[#0a0f1c] p-4 text-sm text-white outline-none"
            />

            <div className="space-y-4">
              {adminWithdrawals.length > 0 ? (
                adminWithdrawals.map((request) => (
                  <div
                    key={`${request.userTelegramId}-${request.requestIndex}`}
                    className="rounded-2xl bg-[#0a0f1c] p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{request.username}</p>
                        <p className="text-xs text-gray-500">ID: {request.userTelegramId}</p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-yellow-400">
                          {formatOnix(request.amount)} ONIX
                        </p>
                        <p className="text-xs text-emerald-400">
                          ≈ {formatOnix(request.eurAmount)} €
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <p className="rounded-xl bg-[#111827] p-2">
                        Balance: {formatOnix(request.userStats.balance)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Earned: {formatOnix(request.userStats.totalEarned)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Week: {formatOnix(request.userStats.weeklyEarned)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Refs: {request.userStats.referralsCount}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Taps: {formatOnix(request.userStats.totalTaps)}
                      </p>
                      <p className="rounded-xl bg-[#111827] p-2">
                        Ach: {request.userStats.achievementsCompleted}
                      </p>
                    </div>

                    {request.userStats.isSuspicious && (
                      <p className="mt-3 rounded-xl bg-red-500/10 p-2 text-xs text-red-400">
                        ⚠️ Suspicious: {request.userStats.suspiciousReasons.join(', ')}
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        onClick={() => reviewWithdrawal(request, 'rejected')}
                        disabled={isAdminLoading}
                        className="rounded-2xl bg-red-500/20 py-3 font-bold text-red-400 active:scale-95 disabled:opacity-50"
                      >
                        Отклонить
                      </button>

                      <button
                        onClick={() => reviewWithdrawal(request, 'approved')}
                        disabled={isAdminLoading}
                        className="rounded-2xl bg-emerald-500/20 py-3 font-bold text-emerald-400 active:scale-95 disabled:opacity-50"
                      >
                        Одобрить
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-center text-gray-400">
                  Pending-заявок нет
                </p>
              )}
            </div>

            <button
              onClick={loadAdminWithdrawals}
              disabled={isAdminLoading}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95 disabled:opacity-50"
            >
              Обновить список
            </button>
          </div>
        </div>
      )}

      {adminPanelVisible && adminPrizePreview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  🛠 Админ-панель
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Призы недели {adminPrizePreview.week}
                </p>
              </div>

              <button
                onClick={() => setAdminPanelVisible(false)}
                className="text-2xl text-gray-400"
              >
                ×
              </button>
            </div>

            <div
              className={`mb-4 rounded-2xl p-4 text-sm font-bold ${
                adminPrizePreview.alreadyAwarded
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-yellow-400/10 text-yellow-400'
              }`}
            >
              {adminPrizePreview.alreadyAwarded
                ? 'Призы за эту неделю уже выданы'
                : 'Призы ещё не выданы'}
            </div>

            <div className="space-y-3">
              {adminPrizePreview.preview.length > 0 ? (
                adminPrizePreview.preview.map((item) => (
                  <div
                    key={`${item.place}-${item.telegramId}`}
                    className="rounded-2xl bg-[#0a0f1c] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">
                          #{item.place} {item.username}
                        </p>
                        <p className="text-xs text-gray-500">
                          week: {formatOnix(item.weeklyEarned)} ONIX
                        </p>
                      </div>

                      <p className="font-bold text-yellow-400">
                        +{formatOnix(item.prize)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-[#0a0f1c] p-4 text-sm text-gray-400">
                  Нет игроков для выдачи призов.
                </p>
              )}
            </div>

            <button
              onClick={awardWeeklyPrizes}
              disabled={
                isAdminLoading ||
                adminPrizePreview.alreadyAwarded ||
                adminPrizePreview.preview.length === 0
              }
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
            >
              {adminPrizePreview.alreadyAwarded
                ? 'Уже выдано'
                : isAdminLoading
                ? 'Загрузка...'
                : 'Выдать призы топ-3'}
            </button>

            <button
              onClick={loadAdminPrizePreview}
              disabled={isAdminLoading}
              className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-white active:scale-95 disabled:opacity-50"
            >
              Обновить preview
            </button>
          </div>
        </div>
      )}

      {referralModalVisible && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 text-center shadow-2xl">
            <button
              onClick={() => setReferralModalVisible(false)}
              className="absolute right-5 top-5 text-2xl text-gray-400"
            >
              ×
            </button>

            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 text-3xl">
              👥
            </div>

            <h2 className="text-2xl font-bold text-white">Пригласи друга</h2>
            <p className="mt-2 text-sm text-gray-400">
              Делись ссылкой и получай ONIX за новых игроков
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Ты получишь</p>
                <p className="mt-1 font-bold text-yellow-400">+{formatOnix(economyConfig.referralReward)}</p>
              </div>

              <div className="rounded-2xl bg-[#0a0f1c] p-4">
                <p className="text-xs text-gray-400">Друг получит</p>
                <p className="mt-1 font-bold text-emerald-400">+{formatOnix(economyConfig.referredUserReward)}</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#0a0f1c] p-4 text-left">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-400">Бонусы сегодня</span>
                <span className="font-bold text-yellow-400">
                  {referralLimit.used} / {referralLimit.max}
                </span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-yellow-400 transition-all"
                  style={{ width: `${referralProgress}%` }}
                />
              </div>

              <p className="mt-3 text-xs text-gray-400">
                {referralLimit.isLimitReached
                  ? `Лимит бонусов на сегодня исчерпан. Следующие бонусы через ${referralResetTime}`
                  : `Можно получить ещё ${referralLimit.remaining} оплачиваемых бонусов сегодня`}
              </p>
            </div>

            <button
              onClick={shareReferralLink}
              className="mt-5 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              📤 Пригласить в Telegram
            </button>

            <button
              onClick={copyReferralLink}
              className="mt-3 w-full rounded-2xl bg-[#0a0f1c] py-4 text-lg font-bold text-white active:scale-95"
            >
              🔗 Скопировать ссылку
            </button>

            {copySuccessVisible && (
              <p className="mt-3 rounded-2xl bg-emerald-500/10 py-2 text-sm font-bold text-emerald-400">
                ✅ Ссылка скопирована
              </p>
            )}
          </div>
        </div>
      )}

      {rewardPopupVisible && (
        <div className="onix-modal-layer fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-[#111827] p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 text-3xl">
              🎉
            </div>

            <h2 className="text-2xl font-bold text-white">
              Получены награды
            </h2>

            <div className="mt-5 space-y-3">
              {rewardPopupItems.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className="rounded-2xl bg-[#0a0f1c] p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-2xl">{item.icon}</span>
                      <p className="truncate text-sm font-bold text-white">
                        {item.title}
                      </p>
                    </div>

                    <p className="shrink-0 text-sm font-bold text-yellow-400">
                      +{formatOnix(item.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setRewardPopupVisible(false);
                setRewardPopupItems([]);
              }}
              className="mt-6 w-full rounded-2xl bg-yellow-400 py-4 text-lg font-bold text-black active:scale-95"
            >
              Забрать
            </button>
          </div>
        </div>
      )}

      {offlineRewardVisible && (
        <div className="onix-modal-layer fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#111827] border border-yellow-400/30 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl shadow-lg">
              ⛏️
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">
              Майнер заработал
            </h3>

            <p className="text-gray-400 mb-4">
              {offlineRewardTime
                ? `Пока вас не было ${offlineRewardTime}`
                : 'Пока вас не было'}
            </p>

            <p className="text-4xl font-bold text-yellow-400 mb-6">
              +{offlineRewardAmount.toLocaleString('ru-RU')} ONIX
            </p>

            <button
              onClick={claimOfflineReward}
              disabled={isClaimingOfflineReward}
              className={`w-full rounded-2xl py-4 text-lg font-bold text-black transition ${
                isClaimingOfflineReward
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-yellow-400 active:scale-95'
              }`}
            >
              {isClaimingOfflineReward ? 'Забираем...' : 'Забрать'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppWithBoundary() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default AppWithBoundary;