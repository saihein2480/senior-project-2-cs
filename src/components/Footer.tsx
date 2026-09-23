"use client";

import React from "react";
import Image from "next/image";
import { useLanguage } from "../contexts/LanguageContext";

/** Public link to the storefront's Telegram order-notification bot. */
const TELEGRAM_BOT_URL = "https://t.me/SweTrendyHubBot";

/** Pink map-pin used beside each branch name. */
function PinIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-pink-600 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
    </svg>
  );
}

/** Pink handset used beside each phone number. */
function PhoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-pink-600 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="relative w-full mt-8 overflow-hidden bg-[#F8EDF1]">
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_auto] gap-10 lg:gap-8 items-start">
          {/* Shan Yoma */}
          <div>
            <h4 className="flex items-center gap-2 font-bold text-gray-900 text-lg mb-3">
              <PinIcon />
              {t("contact_shan_yoma")}
            </h4>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              {t("address_shan")}
            </p>
            <div className="space-y-2">
              <a
                href={`tel:${t("phone1")}`}
                className="flex items-center gap-3 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <PhoneIcon />
                {t("phone1")}
              </a>
              <a
                href={`tel:${t("phone2")}`}
                className="flex items-center gap-3 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <PhoneIcon />
                {t("phone2")}
              </a>
            </div>
          </div>

          {/* Nitchin Pagoda */}
          <div>
            <h4 className="flex items-center gap-2 font-bold text-gray-900 text-lg mb-3">
              <PinIcon />
              {t("contact_nitchin")}
            </h4>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              {t("address_nitchin")}
            </p>
            <div className="space-y-2">
              <a
                href={`tel:${t("phone1")}`}
                className="flex items-center gap-3 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <PhoneIcon />
                {t("phone1")}
              </a>
              <a
                href={`tel:${t("phone2")}`}
                className="flex items-center gap-3 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
              >
                <PhoneIcon />
                {t("phone2")}
              </a>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="flex items-center gap-2 font-bold text-gray-900 text-lg mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-pink-600 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
              </svg>
              {t("legal")}
            </h4>
            <a
              href="/terms-and-conditions"
              className="text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
            >
              {t("terms")}
            </a>
            <div className="mt-4 flex items-center gap-3">
              {/* <a
                href="#"
                target="_blank"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full bg-pink-600 text-white flex items-center justify-center hover:bg-pink-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="3.5" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a> */}
              <a
                href="https://www.facebook.com/swetrendyhub"
                target="_blank"
                aria-label="Facebook"
                className="w-9 h-9 rounded-full bg-pink-600 text-white flex items-center justify-center hover:bg-pink-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M13.5 21v-8h2.6l.4-3h-3V8.2c0-.8.3-1.3 1.4-1.3H16.6V4.2S15.6 4 14.6 4c-2 0-3.4 1.2-3.4 3.5V10H8.6v3h2.6v8h2.3z" />
                </svg>
              </a>
              <a
                href="https://www.tiktok.com/@swetrendyhub"
                target="_blank"
                aria-label="TikTok"
                className="w-9 h-9 rounded-full bg-pink-600 text-white flex items-center justify-center hover:bg-pink-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-5.2-1.74 2.89 2.89 0 0 1 2.31-2.23V8.2a6.34 6.34 0 1 0 6.34 6.34V9.25a8.16 8.16 0 0 0 4.77 1.52V7.32a4.85 4.85 0 0 1-1-0.63z" />
                </svg>
              </a>
              {/* Opens the order-notification bot. External target, so it needs
                  noopener/noreferrer unlike the placeholder social links. */}
              <a
                href="https://t.me/swetrendyhub24"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("telegram_bot_aria")}
                title={t("telegram_bot_aria")}
                className="w-9 h-9 rounded-full bg-pink-600 text-white flex items-center justify-center hover:bg-pink-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 12.3 3.64 11c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 15.6l-2.1 2.04c-.23.23-.42.42-.72.42z" />
                </svg>
              </a>
            </div>

            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:from-rose-600 hover:to-pink-600 hover:shadow-lg"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 12.3 3.64 11c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 15.6l-2.1 2.04c-.23.23-.42.42-.72.42z" />
              </svg>
              {t("telegram_bot_cta")}
            </a>
          </div>

          {/* Boutique illustration */}
          <div className="flex justify-center lg:justify-end lg:-mt-16">
            <Image
              src="/pink-boutique.png"
              alt="Pink Boutique"
              width={230}
              height={230}
              className="object-contain select-none pointer-events-none"
            />
          </div>
        </div>

        <div className="mt-2 border-t border-pink-200/70 pt-5">
          <div className="text-center text-sm text-gray-500">
            {t("copyright")}
          </div>
        </div>
      </div>
    </footer>
  );
}
