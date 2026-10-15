# Watchling

Application statique de suivi des présences. Les données sont conservées dans le navigateur ; les sauvegardes JSON permettent leur transfert manuel. Aucun serveur métier n'est requis.

## Développement

Depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory presence-cours-app-v3
```

## Utilisation

La présentation est claire et compacte par défaut. Le tableau des cours se trie par nom, taux de présence, absences ou quota restant en cliquant sur les en-têtes. Les boutons Présent et Absent d’une ligne encodent la date du jour ; Détail ouvre le bilan du cours. Le thème sombre reste disponible et le choix est mémorisé.

- **Réglages de l’horaire** : choisir les jours et le quadrimestre de chaque cours, les dates de Q1/Q2 et les congés. Les dates sont facultatives ; une période renseignée inclut son premier et son dernier jour. Un jour sans case cochée n'est pas proposé dans « Aujourd’hui ». Le nombre de séances prévues reste indépendant du calendrier et détermine la limite de 40 %.
- **Encoder une journée** : choisir une date, cocher les cours à enregistrer et définir leur statut et leur note. Les cours prévus pour le quadrimestre sélectionné sont présélectionnés, sauf ceux déjà encodés. Les autres cours peuvent être cochés manuellement. Un remplacement demande confirmation ; le bouton Annuler de la notification restaure tout le lot.
- **Voir le détail** : filtrer le bilan et les séances par dates, bornes incluses. Le quota d'absences du cours entier reste affiché séparément du bilan de la période.
- **Changements ponctuels** : annuler une occurrence ou la déplacer vers une date libre, dans le quadrimestre et hors congés. Les jours habituels et l’historique restent inchangés. Retirer un changement rétablit la séance dans le planning. Pour modifier les jours ou les congés d'un cours dont un changement dépend, retirer d'abord ce changement si les nouveaux réglages le rendent incohérent.
- **Tableau de bord** : comparer les cours du quadrimestre sélectionné et trier chaque colonne. Exporter le bilan ou les séances en CSV compatible Excel (UTF-8, séparateur point-virgule), ou imprimer le bilan. Les CSV sont des documents de consultation ; seul le JSON sert à restaurer les données.
- **Séances à vérifier** : repérer les séances passées non encodées en tenant compte des jours, dates de quadrimestre, congés et changements ponctuels. Le bouton résume les 30 derniers jours, limités au début du quadrimestre si renseigné. La fenêtre permet de choisir une autre période de 366 jours maximum. Aucun rappel ne crée d'absence automatiquement.
- **Correction de l’historique** : cocher les séances affichées, choisir un nouveau statut et confirmer. Les notes restent inchangées sauf choix explicite de remplacement. Changer les filtres efface la sélection. L'annulation de la notification restaure toutes les séances corrigées.
- **Exporter / Importer** : les sauvegardes incluent le calendrier, les jours de cours et les changements ponctuels. Les anciens fichiers sans calendrier restent acceptés. Un import remplace les données actuelles après confirmation.

Une seule séance est enregistrée par cours et par date. Les séances justifiées comptent comme des présences et les séances annulées sont exclues du taux de présence. Les congés modifient les suggestions du planning, sans effacer les séances déjà encodées.

## Tests

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Les tests navigateur démarrent leur propre serveur Python sur le port 8765 et utilisent des contextes isolés. Si Chromium est fourni par l'environnement :

```sh
PRESENCE_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- --workers=2
```

GitHub Actions exécute les contrôles, les tests Node et les tests Chromium à chaque envoi sur `main` et pour les pull requests. Netlify utilise le dossier `presence-cours-app-v3` et exécute les contrôles et les tests Node avant publication via `netlify.toml`. Un échec de ces commandes bloque ce déploiement ; le résultat du job navigateur GitHub n'est pas une condition d'attente du déploiement Netlify.

## Mode hors ligne

Après une première visite en ligne sur HTTPS (ou localhost), le service worker met les ressources en cache. Le réseau est prioritaire pour récupérer les mises à jour. Après une modification des ressources, incrémenter la version des URL dans `index.html` ainsi que le nom du cache et la liste des ressources dans `sw.js`.
