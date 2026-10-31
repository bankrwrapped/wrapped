// Groups launches into themes by name and symbol - a keyword guess, not a
// classifier, so a token matching nothing lands in "Everything else" rather
// than being forced into a theme. First matching theme wins.
import type { TokenEntry } from "@/lib/wrapped-data";

export type ThemeId = "ai" | "animals" | "stocks" | "memes" | "culture" | "defi" | "other";

export const THEME_LABEL: Record<ThemeId, string> = {
  ai: "AI & agents",
  animals: "Animal coins",
  stocks: "Stocks & RWAs",
  memes: "Pure memes",
  culture: "People & culture",
  defi: "DeFi & utility",
  other: "Everything else",
};

// Matched against whole words of "name symbol", lowercased.
const KEYWORDS: Array<[ThemeId, RegExp]> = [
  ["ai", /\b(ai|agi|agent|agents|gpt|llm|bot|bots|neural|robot|claude|grok|cyborg)\b/],
  ["animals", /\b(dog|doge|inu|shib|cat|kitty|meow|frog|pepe|toad|bird|ape|monkey|bear|bull|fish|whale|duck|hamster|penguin|rat|fox|wolf|horse|goat|chicken|bunny|panda)\b/],
  ["stocks", /\b(stock|stocks|tsla|aapl|nvda|msft|amzn|googl|meta|hood|spy|qqq|equity|rwa|gold|oil|bond|treasury)\b/],
  ["memes", /\b(meme|moon|lol|based|wagmi|gm|wen|degen|rug|cope|chad|bro|sigma|giga|pump|send|lfg|hodl|ngmi)\b/],
  ["culture", /\b(trump|elon|musk|vitalik|jesse|cz|saylor|president|king|queen|god|jesus|music|art|game|games|film|movie|anime)\b/],
  ["defi", /\b(dao|fi|swap|yield|stake|vault|pay|cash|usd|dollar|fund|capital|labs|protocol|network|chain|bank|bankr|fee|fees)\b/],
];

export function themeOf(token: Pick<TokenEntry, "name" | "symbol">): ThemeId {
  const text = `${token.name} ${token.symbol}`.toLowerCase();
  return KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "other";
}

export type ThemeSummary = { id: ThemeId; label: string; count: number; feesEth: number };

// Themes with at least one launch, highest earning first, then most launches.
export function summarizeThemes(tokens: TokenEntry[]): ThemeSummary[] {
  const byTheme = new Map<ThemeId, ThemeSummary>();
  for (const t of tokens) {
    const id = themeOf(t);
    const s = byTheme.get(id) ?? { id, label: THEME_LABEL[id], count: 0, feesEth: 0 };
    s.count += 1;
    s.feesEth += t.feesEarnedEth;
    byTheme.set(id, s);
  }
  return [...byTheme.values()].sort((a, b) => b.feesEth - a.feesEth || b.count - a.count);
}
