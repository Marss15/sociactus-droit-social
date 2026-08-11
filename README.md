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

Le workflow `.github/workflows/daily-curation.yml` est prévu pour lancer `npm run curate` tous les jours autour de 09:00 en heure de Paris. GitHub cron étant en UTC et pouvant être retardé, le workflow accepte les exécutions tardives et génère quand même l'édition du jour.

Par défaut, l'édition est strictement journalière : un article ou une actualité n'est conservé que si sa date de publication correspond à la date du journal. Pour les textes officiels, l'édition conserve aussi les textes publiés antérieurement mais dont la date d'application détectée correspond au jour du journal. Les éléments collectés mais datés d'un autre jour et sans application le jour même sont rejetés et comptabilisés dans `research.dailyMode.rejectedByDate`. Pour faire une veille historique ponctuelle, lancer la curation avec `SOCIACTUS_STRICT_DAILY_MODE=false`.

La curation écarte les éléments de protection sociale générale lorsqu'ils ne touchent pas directement la relation de travail : assurance maladie, prestations, remboursement de soins, retraite isolée, nominations ou gestion interne de corps administratifs. Les conventions collectives sont classées via `data/convention-priorities.json` et, en production, via l'endpoint Netlify `/api/convention-priorities` : les IDCC ou libellés suivis y gardent leur rang `p1`, `p2` ou `p3` d'un jour à l'autre, et les nouvelles conventions détectées sont ajoutées en `p3` par défaut.

Le site affiche un panneau "Conventions collectives" permettant de modifier ces rangs directement dans l'interface. L'enregistrement est protégé par la variable Netlify `SOCIACTUS_ADMIN_TOKEN`; le jeton est saisi dans le navigateur et conservé en local.

Sur Netlify, un rafraîchissement utilisateur ne relance pas la curation : le site statique relit seulement les fichiers JSON déjà publiés sur GitHub. Le shell Netlify n'a donc pas besoin d'être redéployé tous les jours.

Quand `SOCIACTUS_DATA_BASE_URL` pointe vers GitHub, le build Netlify ne copie pas `data/` dans `dist` afin d'éviter de servir une ancienne copie locale.

## Priorisation

Chaque entrée reçoit un rang de lecture :

- `P1` : lecture prioritaire du jour, limitée aux textes directement applicables et signaux jurisprudentiels forts.
- `P2` : information juridique importante à lire après P1.
- `P3` : veille de contexte, presse ou information de fond.

L'interface démarre sur `P1` pour éviter d'imposer la lecture de tout le journal quotidien.

## Pertinence juridique et personnalisation

La pertinence juridique v2 est un classifieur déterministe et heuristique : elle applique des signaux textuels explicites, des exclusions documentées et une hiérarchie de sources. Elle ne constitue pas un modèle de machine learning et ne prétend pas mesurer une probabilité scientifique. Chaque entrée retenue expose des raisons d'évidence juridique ; les archives JORF/CASS sont des sources primaires, les flux institutionnels des sources officielles et la presse un signal secondaire à recouper.

Les éditions historiques sans métadonnée v2 sont enrichies temporairement dans le navigateur à partir du titre, de la catégorie, de la source et uniquement des extraits source conservés (`sourceSummary`, `excerpt`, `sourceText`, `body` ou `notice`). Le résumé éditorial historique n'est jamais réutilisé comme preuve afin d'éviter qu'une ancienne conclusion heuristique se valide elle-même. Les fichiers `data/*.json` ne sont pas réécrits.

Les avis « Utile » et « Pas utile » utilisent le schéma local `sociactus-feedback-v1` et ne stockent que des caractéristiques stables de l'entrée, jamais son titre ou son résumé. Le classement reste éditorial en premier : la personnalisation est bornée, ne masque aucune entrée et ne permet pas à un P1 de passer derrière un rang inférieur. Le bouton de réinitialisation efface ces avis de l'appareil ; aucune synchronisation distante des préférences n'est prévue.

Sociactus est un outil de veille et ne fournit pas de conseil juridique. Il faut lire la source officielle et qualifier le texte ou la décision avant toute action.

## Tests et build

```bash
npm test
npm run build
node --check app.js scripts/curate.mjs lib/legal-relevance.mjs lib/personalization.mjs
```

La suite inclut un scénario d'isolation de profils : deux stockages locaux indépendants reçoivent le même contenu ; plusieurs avis « Utile » sur la paie et « Pas utile » sur la retraite modifient l'ordre de l'utilisateur A après rechargement, tandis que l'utilisateur B sans avis conserve strictement l'ordre éditorial initial.
