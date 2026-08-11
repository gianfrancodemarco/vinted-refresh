import {
  CollapsibleSection,
  computeDAGLayout,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
  type DAGLayoutEdge,
  type DAGLayoutNode,
} from "cursor/canvas";

type FlowNode = { id: string; label: string; sublabel?: string; tone?: "accent" | "neutral" | "muted" };
type FlowEdge = { from: string; to: string; label?: string; dashed?: boolean };

const LEVELS = [
  { id: 1, label: "Level 1", subtitle: "User commands & pipeline" },
  { id: 2, label: "Level 2", subtitle: "Modules & dependencies" },
  { id: 3, label: "Level 3", subtitle: "Functions & UI steps" },
] as const;

const LEVEL1: { nodes: FlowNode[]; edges: FlowEdge[] } = {
  nodes: [
    { id: "user", label: "User", sublabel: "CLI" },
    { id: "login", label: "login", sublabel: "one-time auth", tone: "accent" },
    { id: "refresh", label: "refresh <url>", sublabel: "re-upload listing", tone: "accent" },
    { id: "session", label: "Save session", sublabel: "storageState.json" },
    { id: "parse", label: "Parse URL", sublabel: "item id + domain" },
    { id: "extract", label: "Extract listing", sublabel: "edit form scrape" },
    { id: "download", label: "Download photos", sublabel: "temp directory" },
    { id: "publish", label: "Publish new copy", sublabel: "/items/new" },
    { id: "hide", label: "Hide original", sublabel: "only after publish" },
    { id: "done", label: "Done", sublabel: "old + new URLs" },
  ],
  edges: [
    { from: "user", to: "login", label: "login cmd", dashed: true },
    { from: "user", to: "refresh", label: "refresh cmd" },
    { from: "login", to: "session" },
    { from: "refresh", to: "parse" },
    { from: "parse", to: "extract" },
    { from: "extract", to: "download" },
    { from: "download", to: "publish" },
    { from: "publish", to: "hide" },
    { from: "hide", to: "done" },
  ],
};

const LEVEL2: { nodes: FlowNode[]; edges: FlowEdge[] } = {
  nodes: [
    { id: "cli", label: "bin/vinted-refresh.js", sublabel: "parseArgs · route commands", tone: "accent" },
    { id: "config", label: "config.js", sublabel: "paths · storageState" },
    { id: "url", label: "url.js", sublabel: "parseItemUrl" },
    { id: "browser", label: "browser.js", sublabel: "Playwright · session", tone: "accent" },
    { id: "refresh", label: "refresh.js", sublabel: "orchestrator", tone: "accent" },
    { id: "extract", label: "extract.js", sublabel: "fields + images" },
    { id: "publish", label: "publish.js", sublabel: "form fill + submit" },
    { id: "hide", label: "hide.js", sublabel: "UI hide action" },
    { id: "vinted", label: "Vinted Web UI", sublabel: "no public API" },
    { id: "fs", label: "Filesystem", sublabel: "temp photos · config dir" },
  ],
  edges: [
    { from: "cli", to: "config", label: "storageStateExists" },
    { from: "cli", to: "browser", label: "interactiveLogin", dashed: true },
    { from: "cli", to: "refresh", label: "refreshItem" },
    { from: "refresh", to: "url" },
    { from: "refresh", to: "browser", label: "withAuthenticatedContext" },
    { from: "refresh", to: "extract" },
    { from: "extract", to: "vinted", label: "goto edit form" },
    { from: "extract", to: "fs", label: "downloadImages" },
    { from: "refresh", to: "publish" },
    { from: "publish", to: "vinted", label: "goto /items/new" },
    { from: "refresh", to: "hide" },
    { from: "hide", to: "vinted", label: "goto item page" },
    { from: "browser", to: "config", label: "load/save session" },
    { from: "browser", to: "vinted" },
  ],
};

const LEVEL3_SECTIONS = [
  {
    title: "Login flow",
    file: "browser.js · config.js",
    nodes: [
      { id: "l1", label: "interactiveLogin()", sublabel: "CLI login cmd" },
      { id: "l2", label: "openBrowserForLogin()", sublabel: "Chrome/Edge + CDP port" },
      { id: "l3", label: "User signs in", sublabel: "Google/Apple OK" },
      { id: "l4", label: "waitForEnter()", sublabel: "stdin prompt" },
      { id: "l5", label: "connectOverCDP()", sublabel: "read live session" },
      { id: "l6", label: "storageState()", sublabel: "→ storageState.json" },
    ] as FlowNode[],
    edges: [
      { from: "l1", to: "l2" },
      { from: "l2", to: "l3" },
      { from: "l3", to: "l4" },
      { from: "l4", to: "l5" },
      { from: "l5", to: "l6" },
    ] as FlowEdge[],
  },
  {
    title: "Refresh orchestration",
    file: "refresh.js",
    nodes: [
      { id: "r1", label: "parseItemUrl()", sublabel: "itemId · baseUrl" },
      { id: "r2", label: "withAuthenticatedContext()", sublabel: "launch + auth check" },
      { id: "r3", label: "extractItemFields()", sublabel: "scrape edit form" },
      { id: "r4", label: "makeTempDir()", sublabel: "os tmp" },
      { id: "r5", label: "downloadImages()", sublabel: "fetch photo URLs" },
      { id: "r6", label: "publishListing()", sublabel: "unless --dry-run" },
      { id: "r7", label: "hideListing()", sublabel: "unless --keep-old" },
      { id: "r8", label: "fs.rmSync(tempDir)", sublabel: "finally block" },
    ] as FlowNode[],
    edges: [
      { from: "r1", to: "r2" },
      { from: "r2", to: "r3" },
      { from: "r3", to: "r4" },
      { from: "r4", to: "r5" },
      { from: "r5", to: "r6" },
      { from: "r6", to: "r7" },
      { from: "r7", to: "r8" },
    ] as FlowEdge[],
  },
  {
    title: "Extract",
    file: "extract.js",
    nodes: [
      { id: "e1", label: "goto(itemUrl)", sublabel: "domcontentloaded" },
      { id: "e2", label: "click edit button", sublabel: "multi-locale selectors" },
      { id: "e3", label: "waitForFunction", sublabel: "#title has value" },
      { id: "e4", label: "page.evaluate()", sublabel: "title · price · photos…" },
      { id: "e5", label: "extractConditionTestId()", sublabel: "dropdown match" },
      { id: "e6", label: "downloadImages()", sublabel: "HTTP fetch → temp files" },
    ] as FlowNode[],
    edges: [
      { from: "e1", to: "e2" },
      { from: "e2", to: "e3" },
      { from: "e3", to: "e4" },
      { from: "e4", to: "e5" },
      { from: "e5", to: "e6" },
    ] as FlowEdge[],
  },
  {
    title: "Publish",
    file: "publish.js",
    nodes: [
      { id: "p1", label: "goto /items/new", sublabel: "session guard" },
      { id: "p2", label: "upload photos", sublabel: "setInputFiles × N" },
      { id: "p3", label: "reactFill()", sublabel: "title · description" },
      { id: "p4", label: "fillFormFields()", sublabel: "category · size · brand…" },
      { id: "p5", label: "fillPrice()", sublabel: "#price input" },
      { id: "p6", label: "submitListing()", sublabel: "wait URL change" },
    ] as FlowNode[],
    edges: [
      { from: "p1", to: "p2" },
      { from: "p2", to: "p3" },
      { from: "p3", to: "p4" },
      { from: "p4", to: "p5" },
      { from: "p5", to: "p6" },
    ] as FlowEdge[],
  },
  {
    title: "Hide",
    file: "hide.js",
    nodes: [
      { id: "h1", label: "goto(itemUrl)", sublabel: "original listing" },
      { id: "h2", label: "find hide button", sublabel: "or open actions menu" },
      { id: "h3", label: "click hide", sublabel: "locale selectors" },
      { id: "h4", label: "confirm dialog", sublabel: "best-effort" },
      { id: "h5", label: "waitForFunction", sublabel: "hidden text / redirect" },
    ] as FlowNode[],
    edges: [
      { from: "h1", to: "h2" },
      { from: "h2", to: "h3" },
      { from: "h3", to: "h4" },
      { from: "h4", to: "h5" },
    ] as FlowEdge[],
  },
];

function edgePath(
  edge: DAGLayoutEdge,
  direction: "vertical" | "horizontal",
  bend = 12,
): string {
  const { sourceX, sourceY, targetX, targetY } = edge;
  if (direction === "vertical") {
    const midY = (sourceY + targetY) / 2;
    return `M ${sourceX} ${sourceY} C ${sourceX} ${midY - bend}, ${targetX} ${midY + bend}, ${targetX} ${targetY}`;
  }
  const midX = (sourceX + targetX) / 2;
  return `M ${sourceX} ${sourceY} C ${midX - bend} ${sourceY}, ${midX + bend} ${targetY}, ${targetX} ${targetY}`;
}

type FlowDiagramProps = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeWidth?: number;
  nodeHeight?: number;
  rankGap?: number;
  nodeGap?: number;
  caption?: string;
};

function FlowDiagram({
  nodes,
  edges,
  nodeWidth = 168,
  nodeHeight = 52,
  rankGap = 56,
  nodeGap = 40,
  caption,
}: FlowDiagramProps) {
  const theme = useHostTheme();
  const layout = computeDAGLayout({
    nodes: nodes.map((n) => ({ id: n.id })),
    edges: edges.map(({ from, to }) => ({ from, to })),
    direction: "vertical",
    nodeWidth,
    nodeHeight,
    rankGap,
    nodeGap,
    padding: 28,
  });

  const labelById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edgeMeta = Object.fromEntries(edges.map((e) => [`${e.from}->${e.to}`, e]));

  return (
    <Stack gap={8}>
      <div style={{ overflowX: "auto", width: "100%" }}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={caption ?? "Flow diagram"}
          style={{ display: "block", minWidth: layout.width }}
        >
          {layout.edges.map((edge) => {
            const meta = edgeMeta[`${edge.from}->${edge.to}`];
            const stroke = meta?.dashed ? theme.stroke.secondary : theme.stroke.primary;
            return (
              <path
                key={`${edge.from}-${edge.to}`}
                d={edgePath(edge, layout.direction)}
                fill="none"
                stroke={stroke}
                strokeWidth={1.5}
                strokeDasharray={meta?.dashed ? "5 4" : undefined}
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={theme.stroke.primary} />
            </marker>
          </defs>

          {layout.nodes.map((pos: DAGLayoutNode) => {
            const node = labelById[pos.id];
            if (!node) return null;
            const isAccent = node.tone === "accent";
            const fill = isAccent ? theme.fill.secondary : theme.bg.elevated;
            const stroke = isAccent ? theme.accent.primary : theme.stroke.secondary;
            const titleColor = theme.text.primary;
            const subColor = theme.text.tertiary;

            return (
              <g key={pos.id}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1}
                />
                <text
                  x={pos.x + nodeWidth / 2}
                  y={pos.y + (node.sublabel ? 20 : nodeHeight / 2 + 4)}
                  textAnchor="middle"
                  fill={titleColor}
                  fontSize={11}
                  fontWeight={600}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {truncate(node.label, 22)}
                </text>
                {node.sublabel ? (
                  <text
                    x={pos.x + nodeWidth / 2}
                    y={pos.y + 36}
                    textAnchor="middle"
                    fill={subColor}
                    fontSize={9.5}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {truncate(node.sublabel, 26)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {caption ? (
        <Text size="small" tone="tertiary">
          {caption}
        </Text>
      ) : null}
    </Stack>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function LevelOne() {
  return (
    <Stack gap={16}>
      <Text tone="secondary">
        Two CLI commands drive everything. The refresh pipeline always reads before it writes — the old
        listing is hidden only after a successful publish.
      </Text>
      <FlowDiagram
        nodes={LEVEL1.nodes}
        edges={LEVEL1.edges}
        caption="Level 1 · User-facing flow · create first, hide second"
      />
      <Row gap={8} wrap>
        <Pill size="sm">--dry-run stops after download</Pill>
        <Pill size="sm">--keep-old skips hide step</Pill>
        <Pill size="sm">--headless less reliable</Pill>
      </Row>
    </Stack>
  );
}

function LevelTwo() {
  return (
    <Stack gap={16}>
      <Text tone="secondary">
        The CLI routes to modules under <code style={{ fontFamily: "monospace" }}>src/</code>.{" "}
        <code style={{ fontFamily: "monospace" }}>refresh.js</code> orchestrates extract → publish → hide
        inside a single authenticated browser context.
      </Text>
      <FlowDiagram
        nodes={LEVEL2.nodes}
        edges={LEVEL2.edges}
        nodeWidth={176}
        nodeHeight={54}
        rankGap={52}
        nodeGap={36}
        caption="Level 2 · Module dependencies · dashed = login-only path"
      />
    </Stack>
  );
}

function LevelThree() {
  return (
    <Stack gap={12}>
      <Text tone="secondary">
        Function-level steps inside each module. Random pauses between UI actions reduce anti-bot triggers.
      </Text>
      {LEVEL3_SECTIONS.map((section, index) => (
        <div key={section.title}>
          <CollapsibleSection
            title={section.title}
            count={section.nodes.length}
            trailing={
              <Text size="small" tone="tertiary">
                {section.file}
              </Text>
            }
            defaultOpen={index === 0}
          >
            <div style={{ paddingTop: 8 }}>
              <FlowDiagram
                nodes={section.nodes}
                edges={section.edges}
                nodeWidth={160}
                nodeHeight={48}
                rankGap={48}
                nodeGap={32}
              />
            </div>
          </CollapsibleSection>
        </div>
      ))}
    </Stack>
  );
}

export default function VintedRefreshFlowCanvas() {
  const [level, setLevel] = useCanvasState<number>("flow-level", 1);
  const active = LEVELS.find((l) => l.id === level) ?? LEVELS[0];

  return (
    <Stack gap={20} style={{ padding: "4px 2px 24px" }}>
      <Stack gap={6}>
        <H1>vinted-refresh flow</H1>
        <Text tone="secondary">
          How a listing is re-uploaded via Playwright browser automation — at three zoom levels.
        </Text>
      </Stack>

      <Row gap={8} wrap align="center">
        {LEVELS.map((item) => (
          <span key={item.id}>
            <Pill
              active={level === item.id}
              size="sm"
              onClick={() => setLevel(item.id)}
              style={{ cursor: "pointer" }}
            >
              {item.label}
            </Pill>
          </span>
        ))}
      </Row>

      <Stack gap={4}>
        <H2>{active.label}</H2>
        <Text size="small" tone="tertiary">
          {active.subtitle}
        </Text>
      </Stack>

      {level === 1 ? <LevelOne /> : null}
      {level === 2 ? <LevelTwo /> : null}
      {level === 3 ? <LevelThree /> : null}

      <Stack gap={8}>
        <H3>Safety guarantees</H3>
        <Row gap={8} wrap>
          <Pill size="sm">Auth redirect → re-login required</Pill>
          <Pill size="sm">Publish failure → old listing stays live</Pill>
          <Pill size="sm">Hide failure → new listing still created</Pill>
          <Pill size="sm">Temp photos always cleaned in finally</Pill>
        </Row>
      </Stack>
    </Stack>
  );
}
