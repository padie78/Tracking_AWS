# Frontend Architecture — Track AWS

Angular 17 standalone + Ionic 8 + Signals + Apache ECharts.

## Capas

```
src/app/
├── core/          # auth, navigation, tenant, notifications
├── pages/         # dashboard, audits, finops, secops, architecture, reports, settings
├── services/      # AppSync GraphQL + realtime
└── ui/            # charts (ECharts), notification center / toasts
```

## Menú por rol

`[Cuenta AWS] × [finops_admin | analyst | viewer] × [Vista]`

| Vista | Roles |
|---|---|
| Inicio | todos |
| Audits | todos |
| FinOps | admin, analyst |
| SecOps | admin, analyst |
| Arquitectura | admin, analyst |
| Reportes | todos |
| Settings | admin |

## Charts (ECharts)

- Gauge score WAF
- Radar pilares Well-Architected
- Pie severidad
- Barras top ahorro
- Tendencia score/ahorro por audit

## Notificaciones

- Campana in-app + toasts
- Disparadas por `onAuditStatusChanged` / findings live + acciones UI
- Canales externos (Slack/webhook): Settings → Alertas
