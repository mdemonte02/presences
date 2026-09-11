# Présence Cours — IETC Bac 2 (2026–2027)

Petite application web installable (PWA) pour suivre les présences et la limite de 40 % d'absences injustifiées par cours.

## Fonctionnalités

- 9 cours préremplis à partir de l'horaire fourni.
- Nombre total de jours modifiable par matière.
- Statuts : Présent / Absent / Justifié / Annulé.
- Taux de présence actuel.
- Compteur d'absences injustifiées.
- Limite calculée à 40 % (arrondie vers le bas).
- Nombre d'absences encore disponibles.
- Historique complet.
- Mode sombre.
- Export / import d'une sauvegarde JSON.
- Données conservées localement dans le navigateur (localStorage).
- Installation possible comme application sur téléphone/ordinateur via PWA.

## Démarrage le plus simple

### Option 1 — Visual Studio Code
1. Ouvrir ce dossier dans VS Code.
2. Installer l'extension **Live Server**.
3. Clic droit sur `index.html` > **Open with Live Server**.

### Option 2 — Python
Dans ce dossier :

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

Le serveur local est recommandé pour que l'installation PWA et le mode hors-ligne fonctionnent.

## Installation sur téléphone

Il faut d'abord héberger l'application en HTTPS (GitHub Pages, Netlify, Vercel, etc.).

### iPhone
Dans Safari : Partager > Ajouter à l'écran d'accueil.

### Android / Chrome
Menu > Installer l'application.

## Logique de calcul

### Présence actuelle
```
Présences / (Présences + Absences injustifiées + Absences justifiées) × 100
```

Les cours annulés ne sont pas comptabilisés.

### Limite d'absences
```
plancher(nombre total de jours × 0,40)
```

Exemple : 25 jours → 10 absences max.

> Important : l'application suit la règle de 40 % telle qu'elle a été décrite. Vérifie auprès de l'école si le règlement applique une autre méthode d'arrondi ou compte les absences par périodes plutôt que par journées.

## Cours préremplis

- Projet de développement Web — 25 jours
- Système d'exploitation 2 — 25 jours
- Notions de e-business 2 — 20 jours
- Base des réseaux — 20 jours
- Projet de développement SGBD — 20 jours
- Structure des ordinateurs 2 — 15 jours
- Mathématique appliquée à l'informatique 2 — 15 jours
- Éléments de statistiques — 10 jours
- Information & communication professionnelle 2 — 10 jours

Tous ces nombres peuvent être modifiés directement dans l'application via **Modifier les cours**.

## Fichiers

- `index.html` : interface
- `styles.css` : design
- `app.js` : logique et stockage
- `manifest.webmanifest` : installation PWA
- `sw.js` : cache hors-ligne
- `icon.svg` : icône


## V3 – correction cache
- Les noms de cours sont forcés selon leur identifiant, donc les anciens « 2 » stockés dans localStorage sont corrigés automatiquement.
- Les croix X ont un `onclick` direct en plus des listeners JavaScript.
- Le Service Worker a été désactivé et les anciens caches sont nettoyés pour éviter de charger une ancienne version.
- `app.js` et `styles.css` utilisent un paramètre `?v=3` pour forcer le rechargement.


## V4 — Horaire intégré

- Nouveau bouton **Horaire** sur la page d'accueil.
- Affichage du PDF officiel directement dans l'application.
- Bouton **Ouvrir en plein écran**.
- Le PDF est inclus dans le projet et disponible hors ligne après mise en cache.
