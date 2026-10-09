"use client";

import { useState } from "react";
import { isLocale, LOCALE_LABELS, t, type Locale } from "@/data/i18n";
import type { SalonConfig } from "@/lib/salon";

type StyleHit = { id: string; name: string };
type ShadeHit = { id: string; name: string };

const SHAPES = ["oval", "round", "square", "heart", "oblong", "diamond"] as const;

export function GuideScreen({ config }: { config: SalonConfig }) {
  const [lang, setLang] = useState<Locale>(isLocale(config.defaultLang) ? config.defaultLang : "en");
  const [shape, setShape] = useState("oval");
  const [who, setWho] = useState<"women" | "men" | "kids">("women");
  const [grey, setGrey] = useState(false);
  const [undertone, setUndertone] = useState<"warm" | "cool" | "neutral">("neutral");
  const [length, setLength] = useState("shoulder");
  const [texture, setTexture] = useState("wavy");
  const [occasion, setOccasion] = useState("daily");
  const [face, setFace] = useState<{ label: string; styles: StyleHit[] } | null>(null);
  const [colour, setColour] = useState<{ label: string; shades: ShadeHit[] } | null>(null);
  const [quiz, setQuiz] = useState<{ label: string; styles: StyleHit[] } | null>(null);

  async function ask<T>(body: unknown) {
    const res = await fetch("/api/v1/guide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{config.name}</p>
          <h1 className="page-title">{t(lang, "guideTitle")}</h1>
        </div>
        <select className="field py-1" aria-label={t(lang, "language")} value={lang} onChange={(event) => setLang(event.target.value as Locale)}>
          {config.languages.filter(isLocale).map((code) => <option key={code} value={code}>{LOCALE_LABELS[code]}</option>)}
        </select>
      </header>
      <p className="text-sm leading-6 text-muted">{t(lang, "guideIntro")}</p>

      <section className="card space-y-3 p-4" aria-labelledby="face-guide">
        <h2 id="face-guide" className="font-serif text-2xl">{t(lang, "faceGuide")}</h2>
        <p className="text-xs text-muted">{t(lang, "guideNotMeasure")}</p>
        <label className="block text-sm">{t(lang, "faceShape")}
          <select className="field mt-1" value={shape} onChange={(event) => setShape(event.target.value)}>
            {SHAPES.map((item) => <option key={item} value={item}>{t(lang, item)}</option>)}
          </select>
        </label>
        <label className="block text-sm">{t(lang, "hubFor")}
          <select className="field mt-1" value={who} onChange={(event) => setWho(event.target.value as typeof who)}>
            <option value="women">{t(lang, "women")}</option>
            <option value="men">{t(lang, "men")}</option>
            <option value="kids">{t(lang, "kids")}</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={() => void ask<{ label: string; styles: StyleHit[] }>({ kind: "face", shape, who }).then((data) => data && setFace(data))}>{t(lang, "showIdeas")}</button>
        {face && (
          <div>
            <p className="text-sm" role="status">{face.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {face.styles.map((style) => (
                <a key={style.id} className="btn secondary" href={`/s/${config.slug}?tool=style&style=${style.id}`}>{style.name}</a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="colour-guide">
        <h2 id="colour-guide" className="font-serif text-2xl">{t(lang, "colourGuide")}</h2>
        <p className="text-xs text-muted">{t(lang, "guideNotPhoto")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={grey} onChange={(event) => setGrey(event.target.checked)} />
          {t(lang, "greyHair")}
        </label>
        <label className="block text-sm">{t(lang, "undertone")}
          <select className="field mt-1" value={undertone} onChange={(event) => setUndertone(event.target.value as typeof undertone)}>
            <option value="warm">{t(lang, "warm")}</option>
            <option value="cool">{t(lang, "cool")}</option>
            <option value="neutral">{t(lang, "neutral")}</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={() => void ask<{ label: string; shades: ShadeHit[] }>({ kind: "colour", grey, undertone }).then((data) => data && setColour(data))}>{t(lang, "showIdeas")}</button>
        {colour && (
          <div>
            <p className="text-sm" role="status">{colour.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colour.shades.map((shade) => (
                <a key={shade.id} className="btn secondary" href={`/s/${config.slug}?tool=colour&shade=${shade.id}`}>{shade.name}</a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="quiz-guide">
        <h2 id="quiz-guide" className="font-serif text-2xl">{t(lang, "quizTitle")}</h2>
        <p className="text-xs text-muted">{t(lang, "quizNote")}</p>
        <label className="block text-sm">{t(lang, "quizWho")}
          <select className="field mt-1" value={who} onChange={(event) => setWho(event.target.value as typeof who)}>
            <option value="women">{t(lang, "women")}</option>
            <option value="men">{t(lang, "men")}</option>
            <option value="kids">{t(lang, "kids")}</option>
          </select>
        </label>
        <label className="block text-sm">{t(lang, "hairType")}
          <select className="field mt-1" value={texture} onChange={(event) => setTexture(event.target.value)}>
            <option value="straight">{t(lang, "straight")}</option>
            <option value="wavy">{t(lang, "wavy")}</option>
            <option value="curly">{t(lang, "curly")}</option>
          </select>
        </label>
        <label className="block text-sm">{t(lang, "quizLength")}
          <select className="field mt-1" value={length} onChange={(event) => setLength(event.target.value)}>
            <option value="short">{t(lang, "lenShort")}</option>
            <option value="shoulder">{t(lang, "lenShoulder")}</option>
            <option value="long">{t(lang, "lenLong")}</option>
          </select>
        </label>
        <label className="block text-sm">{t(lang, "quizOccasion")}
          <select className="field mt-1" value={occasion} onChange={(event) => setOccasion(event.target.value)}>
            <option value="daily">{t(lang, "occDaily")}</option>
            <option value="office">{t(lang, "occOffice")}</option>
            <option value="party">{t(lang, "occParty")}</option>
            <option value="wedding">{t(lang, "occWedding")}</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={() => void ask<{ label: string; styles: StyleHit[] }>({ kind: "quiz", who, length, texture, occasion }).then((data) => data && setQuiz(data))}>{t(lang, "showIdeas")}</button>
        {quiz && (
          <div>
            <p className="text-sm" role="status">{quiz.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {quiz.styles.map((style) => (
                <a key={style.id} className="btn secondary" href={`/s/${config.slug}?tool=style&style=${style.id}`}>{style.name}</a>
              ))}
            </div>
          </div>
        )}
      </section>
      <p className="text-center text-sm"><a className="underline" href={`/s/${config.slug}`}>{t(lang, "backToTry")}</a></p>
    </div>
  );
}
