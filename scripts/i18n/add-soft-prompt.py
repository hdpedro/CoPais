#!/usr/bin/env python3
"""Add softPrompt namespace to all 5 locales in PWA + Native."""
import json
from collections import OrderedDict

PAYLOADS = {
    "pt": {
        "title": "Vamos te avisar quando precisar",
        "subtitle": "O Kindar usa notificações pra coisas como:",
        "line1": "Lembretes antes das atividades das crianças",
        "line2": "Mensagens do coparente no chat",
        "line3": "Vacinas e consultas pendentes",
        "line4": "Mudanças importantes em despesas e decisões",
        "footer": "Você pode customizar tudo depois em Perfil → Notificações.",
        "accept": "Sim, ativar notificações",
        "decline": "Agora não",
    },
    "en": {
        "title": "We'll let you know when it matters",
        "subtitle": "Kindar uses notifications for things like:",
        "line1": "Reminders before your kids' activities",
        "line2": "Messages from your co-parent in chat",
        "line3": "Pending vaccines and appointments",
        "line4": "Important changes in expenses and decisions",
        "footer": "You can customize everything later in Profile → Notifications.",
        "accept": "Yes, enable notifications",
        "decline": "Not now",
    },
    "es": {
        "title": "Te avisaremos cuando importe",
        "subtitle": "Kindar usa notificaciones para cosas como:",
        "line1": "Recordatorios antes de las actividades de tus hijos",
        "line2": "Mensajes del coparente en el chat",
        "line3": "Vacunas y consultas pendientes",
        "line4": "Cambios importantes en gastos y decisiones",
        "footer": "Podés personalizar todo después en Perfil → Notificaciones.",
        "accept": "Sí, activar notificaciones",
        "decline": "Ahora no",
    },
    "fr": {
        "title": "On te préviendra quand ça compte",
        "subtitle": "Kindar utilise les notifications pour des choses comme :",
        "line1": "Rappels avant les activités de tes enfants",
        "line2": "Messages du co-parent dans le chat",
        "line3": "Vaccins et rendez-vous en attente",
        "line4": "Changements importants dans les dépenses et décisions",
        "footer": "Tu peux tout personnaliser plus tard dans Profil → Notifications.",
        "accept": "Oui, activer les notifications",
        "decline": "Pas maintenant",
    },
    "de": {
        "title": "Wir melden uns, wenn es wichtig ist",
        "subtitle": "Kindar nutzt Benachrichtigungen für Dinge wie:",
        "line1": "Erinnerungen vor den Aktivitäten deiner Kinder",
        "line2": "Nachrichten vom Co-Elternteil im Chat",
        "line3": "Ausstehende Impfungen und Termine",
        "line4": "Wichtige Änderungen bei Ausgaben und Entscheidungen",
        "footer": "Du kannst alles später in Profil → Benachrichtigungen anpassen.",
        "accept": "Ja, Benachrichtigungen aktivieren",
        "decline": "Nicht jetzt",
    },
}

NEW_NS = "softPrompt"

for locale, payload in PAYLOADS.items():
    for path in [f"src/i18n/locales/{locale}.json", f"kindar-native/app/_src/i18n/locales/{locale}.json"]:
        with open(path, encoding="utf-8") as f:
            data = json.load(f, object_pairs_hook=OrderedDict)
        data[NEW_NS] = OrderedDict(payload)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(f"  ✓ {locale}: softPrompt ({len(payload)} keys) added to PWA + Native")

print("\nDone.")
