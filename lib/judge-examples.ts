// JUDGE EXAMPLES — TEMPORARY, REMOVE AFTER JUDGING
export interface JudgeExample {
  firstName: string;
  fullName: string;
  role: string;
  text: string;
}

export const JUDGE_EXAMPLES: JudgeExample[] = [
  {
    firstName: "Sean",
    fullName: "Sean Ryan",
    role: "Lead Engineer",
    text: "We're planning to migrate our content and community platforms onto shared infrastructure with the rest of Pendo's stack over the next two quarters, partly to take advantage of Novus once it's rolled out more broadly internally. I want to propose we do this as one coordinated migration rather than module-by-module, since running both systems in parallel for an extended period seems like it'll create more bugs than it prevents. I'm going to raise this at the engineering sync this week.",
  },
  {
    firstName: "Valeria",
    fullName: "Valeria Khokhlova",
    role: "Head of Community",
    text: "Since the Pendo acquisition, a few ProductTank organisers have asked whether Mind the Product is going to start feeling like a Pendo marketing channel. I want to send something to the global organiser group proactively addressing this, reassuring them the community stays vendor-neutral, before it turns into a bigger trust issue at the next round of local meetups.",
  },
  {
    firstName: "Dave",
    fullName: "Dave Killeen",
    role: "VP Product @ Pendo",
    text: "Sales keeps flagging that prospects evaluating us against Mixpanel and Amplitude are put off by not being able to see pricing or start a trial without booking a call. I want to propose we build a self-serve tier for teams under a certain size, even though it's a meaningfully different go-to-market motion than what's worked for our mid-market and enterprise accounts so far. Planning to bring this to the product leadership review next week.",
  },
  {
    firstName: "Joe",
    fullName: "Joe Dreimann",
    role: "VP Design, Novus",
    text: "Right now Novus surfaces friction and proposes a PR, but a human always approves before anything merges. A few design partners have asked whether we'd let it auto-merge low-risk UI fixes — things like spacing or copy clarity — without review, to actually deliver on the 'moves at the speed of your codebase' promise. I want to propose we pilot this for a narrow category of changes with one design partner before opening it up further.",
  },
  {
    firstName: "Curtis",
    fullName: "Curtis Michelson",
    role: "Co-Founder, Jedi On The Fly",
    text: "Our research is showing that teams running agentic AI inside live work hit strong early results, then stall on the harder 30% without realising they've stalled — and we think this is structural, not a model-capability problem. I want to build this into a new offering: a short, paid 'alignment audit' for teams already running agents in production, positioned as the natural next engagement after our retreats. I'm planning to pitch this to two existing clients this month.",
  },
  {
    firstName: "Amit",
    fullName: "Amit Godbole",
    role: "Product Leader | Product Strategist",
    text: "Our usage data shows mid-tier customers are the ones most likely to ask for discounts at renewal, while our top-tier accounts almost never negotiate. I want to propose we restructure the mid-tier pricing band entirely rather than keep handling it case-by-case at renewal time, even though that band brings in a meaningful share of current revenue. I'm planning to bring this to the leadership team this quarter.",
  },
];
// END JUDGE EXAMPLES — TEMPORARY
