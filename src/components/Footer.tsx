"use client";

import React from "react";
import { useLanguage } from "../contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="w-full bg-pink-600 mt-8 text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h4 className="font-semibold text-white text-lg mb-2">
              {t("contact_shan_yoma")}
            </h4>
            <p className="text-md flex items-start gap-2 text-gray-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-cyan-300 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1118 0z"
                />
              </svg>
              <span className="text-gray-100">{t("address_shan")}</span>
            </p>
            <p className="mt-3 text-md space-y-2 text-gray-100">
              <a
                href={`tel:${t("phone1")}`}
                className="text-cyan-300 hover:text-cyan-200 flex items-center gap-2 block transition-colors"
              >
                {t("phone1")}
              </a>
              <a
                href={`tel:${t("phone2")}`}
                className="text-cyan-300 hover:text-cyan-200 flex items-center gap-2 block transition-colors"
              >
                {t("phone2")}
              </a>
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white text-lg mb-2">
              {t("contact_nitchin")}
            </h4>
            <p className="text-md flex items-start gap-2 text-gray-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 text-cyan-300 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 1118 0z"
                />
              </svg>
              <span className="text-gray-100">{t("address_nitchin")}</span>
            </p>
            <p className="mt-3 text-md space-y-2 text-gray-100">
              <a
                href={`tel:${t("phone1")}`}
                className="text-cyan-300 hover:text-cyan-200 flex items-center gap-2 block transition-colors"
              >
                {t("phone1")}
              </a>
              <a
                href={`tel:${t("phone2")}`}
                className="text-cyan-300 hover:text-cyan-200 flex items-center gap-2 block transition-colors"
              >
                {t("phone2")}
              </a>
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white text-lg mb-2">
              {t("legal")}
            </h4>
            <p className="text-md mb-2">
              <a href="/terms-and-conditions" className="text-cyan-300 hover:text-cyan-200 transition-colors">
                {t("terms")}
              </a>
            </p>
            <div className="mt-4 flex items-center space-x-3">
              <a
                href="#"
                aria-label="Instagram"
                className="text-white hover:text-cyan-300 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
                  <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="Facebook"
                className="text-white hover:text-cyan-300 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22 12a10 10 0 10-11.5 9.9v-7h-2.2V12h2.2V9.8c0-2.2 1.3-3.4 3.3-3.4.95 0 1.95.17 1.95.17v2.1h-1.07c-1.05 0-1.37.65-1.37 1.32V12h2.34l-.37 2.9h-1.97v7A10 10 0 0022 12z" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="TikTok"
                className="text-white hover:text-cyan-300 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 8v8a4 4 0 104 4V9h2a4 4 0 10-2-1.732V8h-4z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-teal-500 pt-6">
          <div className="text-center text-md text-gray-200">
            {t("copyright")}
          </div>
        </div>
      </div>
    </footer>
  );
}
