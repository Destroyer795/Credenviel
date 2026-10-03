# Setup Checks — Day Zero

> These checks must be completed before building. A failure here changes the design.
> Source: [DESIGN.md](DESIGN.md) § Pre-build checks

## Checklist

- [ ] **Azure for Students subscription:** confirm the free-services list and any region restrictions. It may already cover some Postgres hours.
- [ ] **Entra tenant app registration:** confirm whether the college Entra tenant allows registering an app; fall back to a personal tenant if not.
- [ ] **Container Apps vCPU quota:** check the quota against what 20 worker replicas would need; lower the KEDA max and the burst target if the quota is tighter.
- [ ] **Sample certificates:** start collecting and labeling the 15–20 sample certificates now — it's the slowest human task and blocks real extraction work.
- [ ] **Azure for Students subscription (confirm 3 things):** current free-services list, region restrictions, and whether the college's Entra tenant allows creating app registrations — a personal Microsoft account/tenant is the fallback if not.
