# Sociactus

Sociactus est un site statique personnel pour curer chaque jour les informations de droit social français : actualités, projets de loi, textes publiés au Journal officiel et jurisprudence sociale.

## Fonctionnement

- `npm run curate` interroge les sources publiques, filtre les contenus de droit social, les classe et génère `data/YYYY-MM-DD.json`.
- `npm run serve` lance un serveur local sur `http://127.0.0.1:4173`.
- Le site est statique : `index.html`, `styles.css`, `app.js` et les fichiers `data/*.json`.
- GitHub Actions peut lancer la curation quotidienne et publier le site gratuitement avec GitHub Pages.

## Sources gratuites intégrées

- DILA JORFSIMPLE : textes quotidiens du Journal officiel, sans clé API, depuis `https://echanges.dila.gouv.fr/OPENDATA/JORFSIMPLE/`.
- DILA CASS : arrêts publiés de la Cour de cassation, dont la chambre sociale, décrits sur `https://www.data.gouv.fr/fr/datasets/cass/`.
- Vie-publique.fr : flux actualités et panorama des lois.
- Service-Public.fr : flux d'actualités particuliers et professionnels.
- Conseil d'État : flux RSS actualités et avis.
- Presse : flux publics de veille journalistique depuis Le Monde, Le Parisien, Le Figaro et franceinfo, filtrés sur le droit social, l'emploi, les retraites, les salaires, la santé au travail et la négociation collective.

Les flux presse sont utilisés comme signaux de veille personnelle : le site affiche un court extrait de flux et renvoie toujours vers l'article original. Les flux Les Échos testés répondent actuellement `403`, ils ne sont donc pas intégrés sans accès ou autorisation spécifique.

## MCP et API de l'Etat

Le serveur MCP officiel `data.gouv.fr` existe et permet à un agent de rechercher des jeux de données ou API du catalogue public : `https://github.com/datagouv/datagouv-mcp`. Pour ce site, il n'est pas nécessaire au fonctionnement quotidien : les flux ouverts et archives DILA sont plus simples à automatiser dans GitHub Actions.

Les API Légifrance et Judilibre existent via PISTE, accessibles gratuitement après inscription, mais avec jeton et quotas. Elles sont utiles pour enrichir plus tard la recherche plein texte et les métadonnées fines :

- API Légifrance : `https://www.data.gouv.fr/dataservices/legifrance/`.
- API Judilibre : `https://www.data.gouv.fr/fr/datasets/api-judilibre/`.
- Présentation DILA open data et API : `https://www.dila.gouv.fr/home/open-data-et-api`.

## Publication gratuite

1. Pousser ce depot sur GitHub.
2. Publier le shell statique sur Netlify.
3. Configurer `SOCIACTUS_DATA_BASE_URL` avec l'URL publique des JSON, par exemple `https://raw.githubusercontent.com/Marss15/sociactus-droit-social/master/data`.
4. Laisser le workflow `.github/workflows/daily-curation.yml` actif.

Le site n'a pas besoin de base de données ni de serveur payant.

## Curation automatique

Le workflow `.github/workflows/daily-curation.yml` est prévu pour lancer `npm run curate` tous les jours à 09:00 en heure de Paris. GitHub cron étant en UTC, le workflow est déclenché aux deux heures UTC possibles puis garde uniquement l'exécution qui tombe réellement à 09:00 à Paris.

Sur Netlify, un rafraîchissement utilisateur ne relance pas la curation : le site statique relit seulement les fichiers JSON déjà publiés sur GitHub. Le shell Netlify n'a donc pas besoin d'être redéployé tous les jours.

Quand `SOCIACTUS_DATA_BASE_URL` pointe vers GitHub, le build Netlify ne copie pas `data/` dans `dist` afin d'éviter de servir une ancienne copie locale.

## Priorisation

Chaque entrée reçoit un rang de lecture :

- `P1` : lecture prioritaire du jour, limitée aux textes directement applicables et signaux jurisprudentiels forts.
- `P2` : information juridique importante à lire après P1.
- `P3` : veille de contexte, presse ou information de fond.

L'interface démarre sur `P1` pour éviter d'imposer la lecture de tout le journal quotidien.
