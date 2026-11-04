import { ExternalLink } from "lucide-react";

const WHY_COPY = [
  "Every builder on Bankr is writing their own story \u2014 one launch, one Please Bro token, one claim at a time. Most of it lives buried in transaction logs nobody ever reads.",
  "Bankr Wrapped exists to change that. Every builder deserves a moment to actually see what they built \u2014 not as a spreadsheet, but as something worth screenshotting, sharing, and being proud of.",
  "This is a love letter to the Bankr community, built by two people who believe builders deserve to see their own receipts.",
];

const BUILDERS = [
  { name: "Kabeer", handle: "basedkabeer" },
  { name: "01CryptoGen", handle: "01CryptoGen" },
];

export function AboutContent() {
  return (
    <div className="grid gap-12 lg:grid-cols-[7fr_5fr] lg:gap-16">
      <section>
        <p className="font-mono text-xs text-[#85858b]">About</p>
        <h1 className="mt-3 max-w-[18ch] font-display text-4xl font-normal leading-[1.08] tracking-tight lg:text-6xl">
          Why Bankr Wrapped exists
        </h1>
        <div className="mt-8 max-w-[40rem] space-y-4 text-[17px] leading-7 text-[#a1a1a6]">
          {WHY_COPY.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </section>

      <section className="lg:pt-8">
        <p className="mb-3 font-mono text-xs text-[#85858b]">Built by</p>
        <ul className="grid gap-2">
          {BUILDERS.map((b) => (
            <li key={b.handle}>
              <a
                href={`https://x.com/${b.handle}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#19191b] px-5 py-4 transition-colors hover:border-white/20"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="truncate text-sm text-[#a1a1a6]">@{b.handle}</p>
                </div>
                <ExternalLink className="size-4 shrink-0 text-[#85858b]" strokeWidth={1.5} />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
