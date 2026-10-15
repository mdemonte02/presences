# Watchling

Application statique de suivi des présences. Les données sont conservées dans le navigateur ; les sauvegardes JSON permettent leur transfert manuel. Aucun serveur métier n'est requis.

## Développement

Depuis la racine du dépôt :

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory presence-cours-app-v3
```

## Utilisation

Le menu **Outils**, à côté d’« Encoder une séance », regroupe l’encodage d’une journée, le PDF de l’horaire, les changements ponctuels, les réglages et les sauvegardes. Il se parcourt au clavier avec Tab et se ferme avec Échap. Le tableau de bord reste accessible près du choix Q1/Q2. Dans l’historique, la correction groupée apparaît après sélection d’au moins une séance.

La présentation est claire et compacte par défaut. Les cours prévus aujourd’hui sont discrètement signalés, en tenant compte des congés et changements ponctuels. Les longs tableaux défilent dans leur zone avec des en-têtes fixes ; les actions des réglages restent accessibles pendant le défilement. Les animations courtes sont désactivées si le navigateur demande une réduction des mouvements. Le tableau des cours se trie par nom, taux de présence, absences ou quota restant en cliquant sur les en-têtes. Les boutons Présent et Absent d’une ligne encodent la date du jour ; Détail ouvre le bilan du cours. Le thème sombre reste disponible et le choix est mémorisé.

- **Réglages de l’horaire** : les onglets Cours, Quadrimestres et Congés séparent les réglages. Choisir un cours dans la liste pour modifier ses paramètres ; les modifications en cours restent conservées lors du passage entre onglets, puis sont enregistrées ensemble avec Sauvegarder. Choisir les jours et le quadrimestre de chaque cours, les dates de Q1/Q2 et les congés. Les dates sont facultatives ; une période renseignée inclut son premier et son dernier jour. Un jour sans case cochée n'est pas proposé dans « Aujourd’hui ». Le nombre de séances prévues reste indépendant du calendrier et détermine la limite de 40 %.
- **Cette semaine** : depuis Aujourd’hui, consulter le planning du lundi au vendredi, les séances déplacées ou annulées et les statuts déjà encodés. Les boutons Précédente et Suivante changent la semaine affichée. Cette vue utilise le quadrimestre sélectionné et ne modifie aucune séance.
- **État du jour** : après encodage, la ligne du cours affiche le statut de la séance du jour avec un bouton Modifier à la place des raccourcis Présent/Absent.
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

Les tests navigateur comprennent des contrôles axe-core ciblés sur les règles WCAG 2.1 A/AA pour la page claire et sombre, les onglets de réglages et la semaine. Ils vérifient aussi la navigation au clavier et une largeur de 640 pixels, équivalente au reflow à 200 % sur un écran de 1280 pixels. Ces contrôles automatisés ne constituent pas une certification d’accessibilité.

## Mode hors ligne

Après une première visite en ligne sur HTTPS (ou localhost), le service worker met les ressources en cache. Le réseau est prioritaire pour récupérer les mises à jour. Après une modification des ressources, incrémenter la version des URL dans `index.html` ainsi que le nom du cache et la liste des ressources dans `sw.js`.
