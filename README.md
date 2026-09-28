# Sociactus

Veille sélective pour un juriste en droit social en cabinet. Le journal quotidien ne présente que :

- les lois et décrets publiés au Journal officiel qui portent directement sur le droit du travail ;
- les projets ou propositions de loi en cours et les annonces officielles de mesures sociales dont le texte n'est pas encore publié ;
- les articles de presse qui signalent un développement juridique concret en droit du travail français.

Une édition peut contenir **zéro information**. Le site affiche alors cette absence et la date de la dernière édition, sans remplir le journal avec des sujets de contexte. Les anciennes éditions passent par le même filtre que les nouvelles.

## Sources

- [JORFSIMPLE de la DILA](https://echanges.dila.gouv.fr/OPENDATA/JORFSIMPLE/) pour les lois et décrets publiés, avec lien direct vers Légifrance.
- [Panorama des lois de Vie-publique](https://www.vie-publique.fr/loi) pour les projets et propositions.
- [Actualités du Code du travail numérique](https://code.travail.gouv.fr/actualite) pour les annonces officielles touchant directement la relation de travail. Leur statut de publication est indiqué explicitement.
- [Flux Atom de droit du travail des Éditions Tissot](https://www.editions-tissot.fr/actualite/feeds/droit-du-travail/last_news.atom) pour repérer les développements juridiques de la presse spécialisée ; seuls le titre, un court extrait et le lien source sont repris.
- Flux RSS publics du Monde, du Parisien, du Figaro et de franceinfo pour la presse.

Le filtre exige un sujet de droit du travail explicite dans le titre. Une mention incidente de l'emploi, du chômage, de la retraite ou de la fonction publique ne suffit pas. Pour la presse, le titre doit aussi signaler un développement juridique : loi, décret, réforme, accord, décision, etc. Les articles dont l'URL contient une date antérieure au jour du journal ne sont pas présentés comme des actualités du jour. Cette sélection volontairement stricte peut omettre certains contenus pertinents : consulter la source primaire avant toute utilisation juridique.

Une annonce officielle découverte avec retard peut être intégrée pendant les sept jours suivant sa publication. La carte conserve sa date source et précise lorsque le texte réglementaire formel n'est pas publié ; l'entrée n'est pas présentée comme une loi ou un décret en vigueur.

Chaque carte indique le stade du texte selon la source : publication au Journal officiel, projet ou proposition, annonce officielle, ou presse. Pour un texte publié, une date d'effet n'est affichée que si elle est explicitement repérée dans la notice ; elle doit être vérifiée dans les dispositions du texte. Aucune entrée en vigueur n'est déduite automatiquement du seul jour de publication. Une actualité sans date source exploitable est écartée.

## Utilisation

```bash
npm run curate       # écrit l'édition du jour dans data/
npm run curate:dry   # vérifie les comptes sans modifier les données
npm run serve        # http://127.0.0.1:4173
npm test
npm run build
```

Le workflow GitHub Actions lance la curation quotidienne. Le site statique peut être publié sur Netlify avec `SOCIACTUS_DATA_BASE_URL` pointant vers le répertoire `data` public du dépôt GitHub. Les erreurs de source sont enregistrées dans `research.errors` de l'édition ; zéro entrée ne signifie pas qu'une source en panne a été vérifiée.
