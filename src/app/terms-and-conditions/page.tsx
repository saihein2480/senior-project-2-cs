"use client";

import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function TermsPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-serif text-center text-rose-500 mb-6 font-pacifico">
        {t("terms")}
      </h1>

      <div className="border border-rose-300 m-9 mr-30 ml-30"></div>

      <div className="prose max-w-none">
        <ol className="list-decimal list-inside ml-4 space-y-2">
          <li>
            Yangon Waiting Time: 3-5 Days, Mandaly Waiting Time: 1-2 Days
            ကားဂိတ်မှတဆင့်ပို့ဆောင်သောမြို့များ ပေးပို့သောမြို့ပေါ်မူတည်၍
            ဂိတ်ချခ ပေးချေရပါမည်။
          </li>
          <li>
            ပစ္စည်းများ Error ပါခဲ့က ဝယ်ယူပြီး (၁) ပတ်အတွင်း Swe Trendy Hub
            ဘက်သို့ဆက်သွယ်အကြောင်းကြားပေးပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။
          </li>
          <li>
            ၁ ပတ်အတွင်း ဝယ်ယူထားသော Error ပါပစ္စည်းများအား Brand ဘက်မှ
            အပြည့်အဝတာဝန်ယူ လဲလည်ပေးပါမည်။
          </li>
          <li>
            ဆိုင်တွင် မိမိစိတ်ကြိုက်ရွေးချယ်ဝယ်ယူထားသော အထည်များအား
            ငွေပြန်အမ်းခြင်း၊ ဆိုဒ်လဲလည်ခြင်းများ လုံးဝ မပြုလုပ်ပေးပါ။
          </li>
          <li>
            ချွင်းချက်အနေဖြင့် Online မှ မိမိစိတ်ကြိုက်ရွေးချယ်ထားသော
            ပစ္စည်းဆိုဒ်အား လဲလိုပါက ပစ္စည်း stock ကျန်လျှင် ဝယ်ယူပြီး
            တပတ်အတွင်း လဲလည်နိုင်ပြီး Delivery ခ အလုံးစုံအား ဝယ်သူဘက်မှ
            ပေးချေရပါမည်။
          </li>
          <li>
            လဲလှယ်ရာတွင် ဆိုဒ်သာ လဲလှယ်လို့ရမည်ဖြစ်ပြီး အရောင်၊ Item ပြောင်းယူ၍
            မရနိုင်ပါ။
          </li>
          <li>
            လဲလှယ်လိုသော ပစ္စည်းများအား Swe Trendy Hub ဘက်သို့
            အရင်ပြန်လည်ပို့ဆောင်ရမည်ဖြစ်ပြီး ပစ္စည်း Error မပါပါက
            လဲလှယ်လိုသောဆိုဒ်အသစ်အား ပြန်လည်ပို့ဆောင်ပေးမည်ဖြစ်ပါတယ်။
          </li>
          <li>
            လဲလှယ်ရာတွင် Swe Trendy Hub Label Tag ပြုတ်သွားပါက၊
            အစွန်းအထင်းများပါပါက ဆိုဒ်ပြန်လဲပေး၍ မရနိုင်ပါ။
          </li>
          <li>
            အလားတူ Refund ပေးရန် အကြုံးဝင်သောပစ္စည်းများအား Swe Trendy Hub ဘက်မှ
            ပစ္စည်းလက်ခံရရှိပြီးမှသာ Refund ပေးမည်ဖြစ်ပါသည်။
          </li>
        </ol>

        <p className="pt-5 text-red-600">
          ဤ Terms &amp; Conditions များသည် တဦးတယောက်အတွက် သတ်မှတ်ထားခြင်း
          မဟုတ်ဘဲ လုပ်ငန်း Process အတိုင်း သတ်မှတ်ထားသော စည်းမျဉ်းများဖြစ်ပါသည်။
          ဝယ်ယူမှုအခါ အထက်ပါ အချက်အလက်များကို ဖတ်ရှု့ပြီး သဘောတူညီသည်ဟုယူဆပါသည်။
        </p>
      </div>
    </div>
  );
}
