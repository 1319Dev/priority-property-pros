import { BottomNav } from "../../src/components/layout/BottomNav";
import { BrandMark } from "../../src/components/brand/Logo";
import { PriorityHelp } from "../../src/components/support/PriorityHelp";

function idle(partial = {}) {
  return {
    ok: true,
    mode: "ai",
    availability: "available",
    humanJoined: false,
    reference: null,
    alreadyOpen: false,
    messages: [],
    guestToken: null,
    answer: null,
    error: null,
    ...partial,
  };
}

function sceneResult(scene) {
  if (scene === "answer") {
    return idle({
      messages: [
        {
          id: "q",
          role: "customer",
          body: "How much does it cost to activate an account?",
          createdAt: "2026-10-10T15:00:00Z",
        },
        {
          id: "a",
          role: "assistant",
          body: "Homeowners and contractors pay a one-time $9.99 activation fee. A contractor pays $4.99 to unlock contact on a project. Priority Property Pros does not take a commission.",
          createdAt: "2026-10-10T15:00:01Z",
        },
      ],
    });
  }
  if (scene === "escalate") {
    return idle({
      reference: "PH-10001",
      humanJoined: false,
      messages: [
        {
          id: "q",
          role: "customer",
          body: "I need a person to look at my registration.",
          createdAt: "2026-10-10T15:02:00Z",
        },
        {
          id: "s",
          role: "system",
          body: "Your message is with the support queue. A person has not joined this chat yet.",
          createdAt: "2026-10-10T15:02:01Z",
        },
      ],
    });
  }
  if (scene === "offline") {
    return idle({
      mode: "human_only",
      availability: "offline",
      humanJoined: false,
    });
  }
  return idle();
}

export function HelpPreview({ scene = "open" }) {
  const transport = {
    request: async () => sceneResult(scene),
  };
  return (
    <div className="paper-grain min-h-dvh bg-cream-50 text-ink-900">
      <header className="border-b border-forest-800/10 px-4 py-4">
        <div className="flex items-center gap-2">
          <BrandMark decorative className="h-9 w-9" />
          <p className="font-display text-lg font-semibold text-forest-800">Priority Property Pros</p>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-4xl font-semibold text-forest-800">How it works</h1>
        <p className="mt-4 max-w-xl text-ink-700">
          Post a project, compare estimates, and hire a pro. Priority Help can answer questions about registration,
          approval, fees, reviews, and Find a Pro.
        </p>
      </main>
      <BottomNav />
      <PriorityHelp transport={transport} initialOpen={scene !== "closed"} initialIntent={scene === "offline" ? "human" : "ask"} />
    </div>
  );
}
