# Sociactus

Veille sélective pour un juriste en droit social en cabinet. Le journal quotidien ne présente que :

- les lois et décrets publiés au Journal officiel qui portent directement sur le droit du travail ;
- les projets ou propositions de loi en cours sur ce champ ;
- les articles de presse qui signalent un développement juridique concret en droit du travail français.

Une édition peut contenir **zéro information**. Le site affiche alors cette absence et la date de la dernière édition, sans remplir le journal avec des sujets de contexte. Les anciennes éditions passent par le même filtre que les nouvelles.

## Sources

- [JORFSIMPLE de la DILA](https://echanges.dila.gouv.fr/OPENDATA/JORFSIMPLE/) pour les lois et décrets publiés, avec lien direct vers Légifrance.
- [Panorama des lois de Vie-publique](https://www.vie-publique.fr/loi) pour les projets et propositions.
- Flux RSS publics du Monde, du Parisien, du Figaro et de franceinfo pour la presse.

Le filtre exige un sujet de droit du travail explicite dans le titre. Une mention incidente de l'emploi, du chômage, de la retraite ou de la fonction publique ne suffit pas. Pour la presse, le titre doit aussi signaler un développement juridique : loi, décret, réforme, accord, décision, etc. Les articles dont l'URL contient une date antérieure au jour du journal ne sont pas présentés comme des actualités du jour. Cette sélection volontairement stricte peut omettre certains contenus pertinents : consulter la source primaire avant toute utilisation juridique.

## Utilisation

```bash
npm run curate       # écrit l'édition du jour dans data/
npm run curate:dry   # vérifie les comptes sans modifier les données
npm run serve        # http://127.0.0.1:4173
npm test
npm run build
```

Le workflow GitHub Actions lance la curation quotidienne. Le site statique peut être publié sur Netlify avec `SOCIACTUS_DATA_BASE_URL` pointant vers le répertoire `data` public du dépôt GitHub. Les erreurs de source sont enregistrées dans `research.errors` de l'édition ; zéro entrée ne signifie pas qu'une source en panne a été vérifiée.
