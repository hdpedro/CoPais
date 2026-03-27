# Kindar - iOS App Store Submission Checklist

## 1. Apple Developer Account

- [ ] Apple Developer Account enrolled ($99/year) - https://developer.apple.com
- [ ] Team Agent or Admin role confirmed
- [ ] Certificates, Identifiers & Profiles configured

## 2. App Identity

| Field | Value |
|---|---|
| App ID (Bundle ID) | `com.kindar.app` |
| Bundle Display Name | Kindar |
| Category | Lifestyle |
| Subcategory | Family |
| Age Rating | 4+ |
| Primary Language | Portuguese (Brazil) |

## 3. Required URLs

- [ ] Privacy Policy URL: `https://kindar.com.br/privacidade`
- [ ] Support URL: `https://kindar.com.br`
- [ ] Marketing URL (optional): `https://kindar.com.br`

## 4. App Store Assets

### Screenshots (required for each device size)
- [ ] iPhone 6.7" (1290 x 2796) - iPhone 15 Pro Max / 16 Plus
- [ ] iPhone 6.1" (1179 x 2556) - iPhone 15 Pro / 16
- [ ] iPad Pro 12.9" (2048 x 2732) - if supporting iPad

### Recommended Screenshots (5-8 per device)
1. Dashboard / Home screen
2. Shared calendar view
3. Chat / messaging
4. Expense tracking / financial split
5. Child health module
6. Schedule builder

### Other Assets
- [ ] App Icon 1024x1024 (no transparency, no rounded corners)
- [ ] App Preview Video (optional, 15-30 seconds)

## 5. App Store Description

### Portuguese (primary)

**Title:** Kindar - Dois Lares, Uma Rotina

**Subtitle (30 chars):** Coparentalidade organizada

**Promotional Text (170 chars):**
Organize a rotina dos seus filhos entre dois lares. Calendario, chat, despesas e saude em um so lugar.

**Description:**
Kindar e o app completo para familias com guarda compartilhada. Criado para pais e maes que querem organizar a vida dos filhos entre dois lares com clareza, respeito e tranquilidade.

Funcionalidades principais:

- Calendario compartilhado com escala de guarda e eventos
- Chat mediado para comunicacao respeitosa entre os pais
- Controle financeiro com divisao de despesas estilo Splitwise
- Modulo de saude completo: vacinas, consultas, medicamentos, alergias e crescimento
- Registro de atividades escolares e extracurriculares
- Check-in emocional para acompanhar o bem-estar das criancas
- Acordos e decisoes importantes documentadas
- Notificacoes push para lembretes e atualizacoes
- Exportacao de relatorios em PDF

Kindar nao e apenas um app - e uma ferramenta que coloca as criancas em primeiro lugar. Funciona mesmo quando os pais nao concordam em tudo.

Gratuito para comecar. Sem anuncios.

**Keywords (100 chars):**
coparentalidade,guarda compartilhada,filhos,calendario familiar,despesas,saude infantil,dois lares

### English

**Title:** Kindar - Two Homes, One Routine

**Subtitle:** Organized co-parenting

**Promotional Text:**
Organize your children's routine between two homes. Calendar, chat, expenses, and health in one place.

**Description:**
Kindar is the complete app for shared custody families. Built for parents who want to organize their children's lives between two homes with clarity, respect, and peace of mind.

Key features:

- Shared calendar with custody schedule and events
- Mediated chat for respectful co-parent communication
- Financial tracking with Splitwise-style expense splitting
- Complete health module: vaccines, appointments, medications, allergies, and growth tracking
- School and extracurricular activity management
- Emotional check-in to monitor children's well-being
- Documented agreements and important decisions
- Push notifications for reminders and updates
- PDF report export

Kindar is more than an app - it's a tool that puts children first. It works even when parents don't agree on everything.

Free to start. No ads.

**Keywords:**
co-parenting,shared custody,children,family calendar,expenses,child health,two homes,coparent

## 6. Review Information

### Demo Account for Apple Reviewer
- [ ] Email: `revisor@kindar.com.br`
- [ ] Password: (create a dedicated test account)
- [ ] Notes: Provide pre-populated data so reviewer sees a functional app

### Review Notes (attach to submission)
```
Kindar is a co-parenting coordination platform for separated/divorced families with shared custody.

To test the full experience:
1. Log in with the provided demo account
2. The account is pre-configured with a co-parenting group, children, and sample data
3. Navigate through: Dashboard > Calendar > Chat > Expenses > Health
4. All features are functional with the demo account

The app uses Capacitor to wrap our Next.js web application with native iOS integrations including:
- Push notifications via APNs
- Haptic feedback on navigation
- Native-feeling status bar and safe area handling
- Offline support with cached content

This app provides unique value beyond a website:
- Push notifications for custody reminders and co-parent messages
- Haptic feedback for native-feeling interactions
- Offline access to cached schedules and health records
- Safe area support for all iOS devices
- Native-like navigation without browser chrome
```

## 7. Compliance & Legal

- [ ] Export Compliance: No encryption beyond HTTPS (select "No" for encryption)
- [ ] Content Rights: All content is user-generated, no third-party content
- [ ] Privacy Nutrition Labels configured in App Store Connect:
  - Data collected: Name, email, children names/ages (functionality)
  - Data linked to user: Name, email
  - Data not linked: Usage analytics (PostHog)
- [ ] LGPD (Brazilian data protection law) compliance verified
- [ ] COPPA compliance: App manages children's data through parent accounts only

## 8. Technical Requirements

- [ ] Minimum iOS version: 15.0
- [ ] Supports all iPhone screen sizes (SE to Pro Max)
- [ ] Supports iPad (if applicable)
- [ ] Supports Dynamic Island / notch
- [ ] StatusBar configured (light style, #EEECEA background)
- [ ] Safe areas handled (top + bottom)
- [ ] No pinch-to-zoom (native app feel)
- [ ] Loading states on all pages (skeleton screens)
- [ ] Error boundaries on all route groups
- [ ] Offline page when network unavailable

## 9. Pre-Submission Build Steps (requires Mac with Xcode)

```bash
# 1. Add iOS platform
npx cap add ios

# 2. Build Next.js static export (if not using server URL)
# npm run build && npx next export

# 3. Sync web assets to iOS project
npx cap sync ios

# 4. Open Xcode project
npx cap open ios

# 5. In Xcode:
#    - Set Bundle Identifier: com.kindar.app
#    - Set Display Name: Kindar
#    - Configure signing (Apple Developer Team)
#    - Set minimum deployment target: iOS 15.0
#    - Add push notification capability
#    - Configure App Icons (Assets.xcassets)
#    - Configure Launch Storyboard

# 6. Archive and upload to App Store Connect
#    Product > Archive > Distribute App > App Store Connect
```

## 10. Post-Submission

- [ ] App Store Connect: Fill in all metadata
- [ ] Set pricing: Free
- [ ] Set availability: Brazil (initially), expand later
- [ ] Submit for review
- [ ] Monitor review status (typically 24-48 hours)

---

## Apple Review Risk Assessment

### Is the app a "website wrapper"?

**Risk: MEDIUM** - The app loads content from `kindar.com.br` via Capacitor's server URL. Apple may flag this as a website wrapper (Guideline 4.2).

**Mitigations already in place:**
1. Native push notifications via APNs (not just web push)
2. Haptic feedback on navigation taps
3. Native status bar and splash screen configuration
4. Safe area handling for notch/Dynamic Island/home indicator
5. Offline support with cached content and dedicated offline page
6. No browser chrome visible (no URL bar, no back/forward buttons)
7. Native-like skeleton loading states on all pages
8. Prevents pinch-to-zoom (maximumScale=1)
9. Native overscroll behavior (no bounce)
10. Input zoom prevention (16px font-size)

**If Apple rejects as a wrapper, consider:**
- Migrate to static export (`next export`) + local assets instead of server URL
- Add more native features: Camera access, Local notifications, Biometric auth
- Implement native navigation transitions via Capacitor Motion
- Add widget support (iOS 17+)

### Does the app provide value beyond a website?

**YES:**
- Push notifications work natively (APNs, not web push which iOS limits)
- Haptic feedback on interactions
- Home screen icon without Safari PWA install friction
- Offline access to key data
- Always-on quick access from app switcher
- Integration with iOS notification center and badges
- Future: Widgets, Shortcuts, ShareSheet integration

### Are there native features?

| Feature | Status |
|---|---|
| Push Notifications | Implemented (APNs via Capacitor) |
| Haptic Feedback | Implemented (navigation, actions) |
| Status Bar | Configured (light style) |
| Splash Screen | Configured |
| Keyboard handling | Configured (body resize) |
| Offline support | Implemented (SW + offline page) |
| Safe Areas | CSS env() variables |
| Biometric Auth | Not yet (future) |
| Camera | Not yet (future - receipts) |
| Share Sheet | Not yet (future) |

### Does it work offline?

**YES** - The service worker:
- Pre-caches essential assets (icons, manifest)
- Caches navigation responses for offline reuse
- Caches static assets (images, CSS, JS) on first load
- Shows a branded offline page when network is completely unavailable
- Push notifications are queued and delivered when back online

### Is content appropriate?

**YES** - Age rating 4+:
- No user-generated public content (all content is private to family groups)
- No violence, adult content, or gambling
- Children's data is managed exclusively through parent accounts
- Chat is limited to co-parents within the same group
- No third-party ads
