import { useState } from "react";
import yaml from "js-yaml";
import Header from "./components/Header";

const REPO_URL = "https://github.com/Babug01/k8s-manifest-linter";

// Kept deliberately non-exhaustive — these are the beta API groups that
// actually show up in the wild years after their stable replacement shipped
// (extensions/v1beta1 Deployments/Ingresses are still pasted from old
// tutorials constantly). Not a full deprecation-watch list.
const DEPRECATED_API_VERSIONS = new Set([
  "extensions/v1beta1",
  "apps/v1beta1",
  "apps/v1beta2",
  "batch/v1beta1",
  "policy/v1beta1",
  "rbac.authorization.k8s.io/v1beta1",
  "networking.k8s.io/v1beta1",
]);

const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job"]);

// Where the PodSpec (containers, volumes, hostNetwork, ...) lives differs by
// kind — Pod has it directly, controllers wrap it in .spec.template.spec,
// and CronJob adds one more layer via .spec.jobTemplate.
function getPodSpec(doc) {
  const kind = doc?.kind;
  if (kind === "Pod") return doc.spec || null;
  if (kind === "CronJob") return doc?.spec?.jobTemplate?.spec?.template?.spec || null;
  if (WORKLOAD_KINDS.has(kind)) return doc?.spec?.template?.spec || null;
  return null;
}

// True when the image has no tag at all, OR the tag is explicitly "latest".
// Only looks at the segment after the last "/" so a registry host:port
// (e.g. myregistry.local:5000/app) isn't mistaken for a tag separator.
function isLatestOrNoTag(image) {
  if (!image || typeof image !== "string") return true;
  const lastSegment = image.split("/").pop();
  if (!lastSegment.includes(":")) return true;
  return lastSegment.split(":").pop() === "latest";
}

function lintContainer(container, podSpec, role, docLabel, findings) {
  const name = container?.name || "(unnamed container)";
  const label = `${docLabel} → ${role} "${name}"`;

  const hasRequests = !!container?.resources?.requests;
  const hasLimits = !!container?.resources?.limits;
  if (!hasRequests || !hasLimits) {
    const missing = [!hasRequests && "requests", !hasLimits && "limits"].filter(Boolean).join(" and ");
    findings.push({
      severity: "error", label,
      message: `Missing resources.${missing}`,
      fix: `Set resources.${missing} (cpu/memory) so the scheduler can place it correctly and it can't starve or exhaust the node.`,
    });
  }

  const image = container?.image;
  const latestish = isLatestOrNoTag(image);
  if (latestish) {
    findings.push({
      severity: "warning", label,
      message: `Image "${image || "(none)"}" has no tag or uses :latest`,
      fix: "Pin to an immutable tag or digest (image@sha256:...) so rollouts are reproducible and rollbacks are possible.",
    });
  }
  if (latestish && container?.imagePullPolicy !== "Always") {
    findings.push({
      severity: "info", label,
      message: `imagePullPolicy is "${container?.imagePullPolicy || "unset"}" while using :latest`,
      fix: "Set imagePullPolicy: Always — otherwise a node with a cached :latest image never pulls the new one.",
    });
  }

  if (!container?.livenessProbe) {
    findings.push({ severity: "warning", label, message: "No livenessProbe defined", fix: "Add a livenessProbe so Kubernetes can restart the container if it hangs." });
  }
  if (!container?.readinessProbe) {
    findings.push({ severity: "warning", label, message: "No readinessProbe defined", fix: "Add a readinessProbe so Service traffic isn't sent to a container before it's ready." });
  }

  const effectiveRunAsNonRoot = container?.securityContext?.runAsNonRoot ?? podSpec?.securityContext?.runAsNonRoot;
  if (effectiveRunAsNonRoot !== true) {
    findings.push({
      severity: "warning", label,
      message: container?.securityContext || podSpec?.securityContext ? "runAsNonRoot is not set to true" : "No securityContext defined",
      fix: "Set securityContext.runAsNonRoot: true (container or pod level) so the image can't silently run as root.",
    });
  }

  if (container?.securityContext?.privileged === true) {
    findings.push({ severity: "error", label, message: "privileged: true", fix: "Remove privileged: true — it gives full access to the host; request specific capabilities instead." });
  }
}

function lintPodSpec(podSpec, docLabel, findings) {
  if (!podSpec) return;

  for (const field of ["hostNetwork", "hostPID", "hostIPC"]) {
    if (podSpec[field] === true) {
      findings.push({
        severity: "error", label: docLabel,
        message: `${field}: true`,
        fix: `Remove ${field}: true unless this workload genuinely needs host namespace access — it breaks pod isolation.`,
      });
    }
  }

  for (const v of podSpec.volumes || []) {
    if (v && v.hostPath) {
      findings.push({
        severity: "warning", label: docLabel,
        message: `hostPath volume "${v.name}" (${v.hostPath.path})`,
        fix: "Avoid hostPath — it ties the pod to node-local state and can expose the host filesystem; prefer a PVC or projected volume.",
      });
    }
  }

  if (podSpec.automountServiceAccountToken !== false) {
    findings.push({
      severity: "info", label: docLabel,
      message: "automountServiceAccountToken is not explicitly false",
      fix: "Set automountServiceAccountToken: false unless the pod actually calls the Kubernetes API.",
    });
  }

  const allContainers = [...(podSpec.containers || []), ...(podSpec.initContainers || [])];
  const hasPreStop = allContainers.some((c) => c?.lifecycle?.preStop);
  if (hasPreStop && podSpec.terminationGracePeriodSeconds === undefined) {
    findings.push({
      severity: "info", label: docLabel,
      message: "preStop hook present but terminationGracePeriodSeconds not set",
      fix: "Set terminationGracePeriodSeconds long enough to cover the preStop hook plus a clean shutdown.",
    });
  }
}

function lintDocument(doc, findings) {
  if (!doc || typeof doc !== "object") return;
  const kind = doc.kind || "(unknown kind)";
  const name = doc?.metadata?.name || "(unnamed)";
  const docLabel = `${kind} "${name}"`;

  if (doc.apiVersion && DEPRECATED_API_VERSIONS.has(doc.apiVersion)) {
    findings.push({
      severity: "error", label: docLabel,
      message: `Uses deprecated apiVersion "${doc.apiVersion}"`,
      fix: `Migrate ${kind} to its current stable API group/version (e.g. apps/v1) — this apiVersion is removed in modern Kubernetes.`,
    });
  }

  if (kind === "Service" && doc?.spec?.type === "LoadBalancer") {
    const annotations = doc?.metadata?.annotations;
    if (!annotations || Object.keys(annotations).length === 0) {
      findings.push({
        severity: "info", label: docLabel,
        message: "type: LoadBalancer with no annotations",
        fix: "Most cloud providers read annotations (SKU, internal/external, subnet, resource group, ...) to provision the load balancer — confirm none are needed here.",
      });
    }
  }

  const podSpec = getPodSpec(doc);
  if (podSpec) {
    lintPodSpec(podSpec, docLabel, findings);
    for (const c of podSpec.containers || []) lintContainer(c, podSpec, "container", docLabel, findings);
    for (const c of podSpec.initContainers || []) lintContainer(c, podSpec, "initContainer", docLabel, findings);
  }
}

function lintManifests(yamlText) {
  const docs = yaml.loadAll(yamlText).filter((d) => d !== null && d !== undefined);
  const findings = [];
  for (const doc of docs) lintDocument(doc, findings);
  const summary = { error: 0, warning: 0, info: 0 };
  for (const f of findings) summary[f.severity]++;
  return { docCount: docs.length, findings, summary };
}

const SEVERITY_ORDER = ["error", "warning", "info"];
const SEVERITY_LABEL = { error: "Errors", warning: "Warnings", info: "Info" };

const EXAMPLE = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    spec:
      hostNetwork: true
      containers:
        - name: app
          image: nginx
---
apiVersion: v1
kind: Service
metadata:
  name: web-lb
spec:
  type: LoadBalancer
  ports:
    - port: 80
`;

const styles = {
  root: { minHeight: "100dvh", display: "flex", flexDirection: "column" },
  content: { fontFamily: "system-ui, sans-serif", padding: "24px 32px", maxWidth: 900, margin: "0 auto", color: "var(--text, #1a1a1a)", width: "100%", boxSizing: "border-box", background: "var(--bg-subtle, #f0efed)", flex: 1 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, opacity: 0.6, margin: "4px 0 20px" },
  textarea: {
    width: "100%", minHeight: 220, padding: 12, borderRadius: 8, border: "1px solid var(--border, #e5e7eb)",
    background: "var(--input-bg, #f9fafb)", color: "var(--text, #1a1a1a)", fontSize: 12, boxSizing: "border-box",
    fontFamily: "'SFMono-Regular', Consolas, monospace", resize: "vertical",
  },
  row: { display: "flex", gap: 10, marginTop: 12, marginBottom: 20 },
  btn: (kind) => ({
    padding: "9px 18px", borderRadius: 6, border: kind === "primary" ? "none" : "1px solid var(--border, #e5e7eb)",
    background: kind === "primary" ? "var(--accent, #4f46e5)" : "transparent",
    color: kind === "primary" ? "#fff" : "var(--text, #1a1a1a)", cursor: "pointer", fontSize: 13, fontWeight: 600,
  }),
  errorBox: {
    padding: 16, borderRadius: 8, border: "1px solid #e05c5c", background: "rgba(224,92,92,0.08)",
    color: "#e05c5c", fontSize: 13, marginBottom: 20, whiteSpace: "pre-wrap",
  },
  summaryRow: { display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  summaryBadge: (severity, count) => ({
    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    background: severity === "error" ? "rgba(224,92,92,0.1)" : severity === "warning" ? "rgba(224,160,92,0.1)" : "rgba(79,70,229,0.1)",
    color: count === 0 ? "var(--text, #1a1a1a)" : severity === "error" ? "#e05c5c" : severity === "warning" ? "#c97f2e" : "var(--accent, #4f46e5)",
    opacity: count === 0 ? 0.5 : 1,
  }),
  cleanBox: {
    padding: 16, borderRadius: 8, border: "1px solid #3fb950", background: "rgba(63,185,80,0.08)",
    color: "#3fb950", fontSize: 14, fontWeight: 600, marginBottom: 20,
  },
  section: { marginBottom: 20 },
  sectionTitle: (severity) => ({
    fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10,
    color: severity === "error" ? "#e05c5c" : severity === "warning" ? "#c97f2e" : "var(--accent, #4f46e5)",
  }),
  finding: {
    padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)", background: "var(--input-bg, #f9fafb)",
    marginBottom: 8,
  },
  findingLabel: { fontSize: 11, opacity: 0.55, marginBottom: 4, fontFamily: "'SFMono-Regular', Consolas, monospace" },
  findingMessage: { fontSize: 13, fontWeight: 600, marginBottom: 4 },
  findingFix: { fontSize: 12, opacity: 0.75 },
};

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function lint() {
    if (!input.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    try {
      setResult(lintManifests(input));
      setError(null);
    } catch (e) {
      setResult(null);
      setError("Couldn't parse YAML — " + e.message);
    }
  }

  function clearAll() {
    setInput("");
    setResult(null);
    setError(null);
  }

  function loadExample() {
    setInput(EXAMPLE);
    setResult(null);
    setError(null);
  }

  const groups = result ? SEVERITY_ORDER.map((sev) => ({ severity: sev, items: result.findings.filter((f) => f.severity === sev) })).filter((g) => g.items.length > 0) : [];

  return (
    <div style={styles.root}>
      <Header repoUrl={REPO_URL} />
      <div style={styles.content}>
        <h1 style={styles.title}>Kubernetes Manifest Linter</h1>
        <p style={styles.subtitle}>
          Paste one or more <code>---</code>-separated YAML documents. Checks Deployments, StatefulSets, DaemonSets,
          Pods, Jobs, CronJobs and Services against common production-readiness and security pitfalls. Nothing leaves
          the browser.
        </p>

        <textarea style={styles.textarea} value={input} onChange={(e) => setInput(e.target.value)} placeholder="apiVersion: apps/v1&#10;kind: Deployment&#10;..." spellCheck={false} />
        <div style={styles.row}>
          <button style={styles.btn("primary")} onClick={lint}>Lint</button>
          <button style={styles.btn("secondary")} onClick={loadExample}>Load Example</button>
          <button style={styles.btn("secondary")} onClick={clearAll}>Clear</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {result && (
          <>
            <div style={styles.summaryRow}>
              {SEVERITY_ORDER.map((sev) => (
                <div key={sev} style={styles.summaryBadge(sev, result.summary[sev])}>
                  {SEVERITY_LABEL[sev]}: {result.summary[sev]}
                </div>
              ))}
            </div>

            {result.findings.length === 0 ? (
              <div style={styles.cleanBox}>
                No findings across {result.docCount} document{result.docCount !== 1 ? "s" : ""} — looks production-ready by these checks.
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.severity} style={styles.section}>
                  <div style={styles.sectionTitle(g.severity)}>{SEVERITY_LABEL[g.severity]} ({g.items.length})</div>
                  {g.items.map((f, i) => (
                    <div key={i} style={styles.finding}>
                      <div style={styles.findingLabel}>{f.label}</div>
                      <div style={styles.findingMessage}>{f.message}</div>
                      <div style={styles.findingFix}>Fix: {f.fix}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
