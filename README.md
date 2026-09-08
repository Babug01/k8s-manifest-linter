# Kubernetes Manifest Linter

**Live demo:** https://babug01.github.io/k8s-manifest-linter/

Paste one or more `---`-separated YAML documents and get a severity-grouped list of common
production-readiness and security issues, each with a one-line fix suggestion — the checks I
actually run over manifests before they go anywhere near a cluster. Runs entirely in the browser;
nothing you paste ever leaves your machine.

## Features

- **12 rule checks** per container/pod spec found in a Deployment, StatefulSet, DaemonSet, Pod,
  Job, CronJob, or Service:
  - Missing `resources.requests` / `resources.limits` (error)
  - Image with no tag or `:latest` (warning)
  - `imagePullPolicy: Always` missing when the tag is `:latest` (info)
  - No `livenessProbe` / `readinessProbe` defined (warning)
  - `securityContext` missing or `runAsNonRoot` not `true` (warning)
  - `privileged: true` (error)
  - `hostNetwork` / `hostPID` / `hostIPC: true` (error)
  - Deprecated `apiVersion` (e.g. `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2`) (error)
  - `hostPath` volume present (warning)
  - `automountServiceAccountToken` not explicitly `false` (info)
  - `Service` of type `LoadBalancer` with no annotations (info)
  - Missing `terminationGracePeriodSeconds` when a `preStop` hook is present (info)
- **Severity summary badges** (errors / warnings / info counts) plus a per-finding fix suggestion
- Understands where the PodSpec actually lives for each kind — including the extra
  `spec.jobTemplate.spec.template.spec` nesting on a `CronJob`

## Why I built this

Between `kubeval`/`kube-linter`/OPA policies there's real tooling for this, but I wanted a
zero-install, paste-and-go version of the checks I run most often, as one piece of a larger
internal DevOps tool I built at work consolidating the utility pages a platform engineer reaches
for daily into one place — this repo is the manifest linter piece, cleaned up and open-sourced on
its own.

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- [`js-yaml`](https://github.com/nodeca/js-yaml) for parsing multi-document YAML (`loadAll`)

## Running locally

```bash
git clone https://github.com/Babug01/k8s-manifest-linter.git
cd k8s-manifest-linter
npm install
npm run dev
```

## License

MIT — see [LICENSE](LICENSE).
