# WeatherRecord

Tableau météo public du Sul de Minas : précipitations, Tmean, Tmin et Tmax quotidiennes depuis 1981. Sélection des années, comparaisons et normales 1991–2020. Interface en français, mobile et ordinateur.

## Sources et méthode

ERA5 via [Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), avec complément récent ECMWF IFS signalé provisoire. Moyenne arithmétique de quatre points (25 % chacun), sans ajustement d'altitude (`elevation=nan`), jours America/Sao_Paulo. Ce sont des données sur grille, pas des observations de station. Résolution native ERA5 : environ 0,25° ; la maille renvoyée est conservée dans la provenance. L'indice ne représente pas une moyenne pondérée des surfaces caféières.

Comparaison mensuelle séparée [NASA POWER](https://power.larc.nasa.gov/) / MERRA-2 : PRECTOTCORR_SUM (mm mensuels), T2M, T2M_MIN_AVG, T2M_MAX_AVG (°C), GWETROOT (fraction de saturation racinaire 0–100 cm, 0–1). Résolution MERRA-2 0,5° × 0,625°. NASA utilise le temps solaire local. Boa Esperança et Guapé partagent une maille NASA. Coordonnées et leurs sources municipales : `site/data/locations.json`.

La pluie mensuelle est la somme des jours ; les températures mensuelles sont des moyennes. Normales mensuelles : moyenne de chaque mois sur 1991–2020, séparément par source. Anomalie = valeur − normale. Normales quotidiennes par jour du calendrier, avec huit années pour le 29 février. Mois incomplets omis, aucun remplissage ni interpolation. Les années partielles restent partielles. Le cumul s'interrompt à la première valeur absente.

Les requêtes exactes, dates de collecte, mailles et empreintes des réponses sont dans `site/data/provenance.json` et `site/data/nasa.json`. Les réponses pouvant être révisées par les producteurs, une réexécution ultérieure peut différer. Le cache régional et les données publiées sont versionnés dans Git. Attribution : ECMWF/Copernicus, Open-Meteo (CC BY 4.0), NASA POWER.

## Actualisation et reproduction

Python 3.12, bibliothèque standard uniquement :

```sh
python scripts/update_weather.py
python scripts/update_nasa.py
python scripts/validate_data.py
python -m http.server 8765 --directory site
```

`update_weather.py --as-of YYYY-MM-DD` permet de fixer la date de collecte souhaitée. Conserver le cache pour actualiser les 100 derniers jours plutôt que recharger l'historique. Supprimer le cache dans une copie permet une extraction complète. Respecter les limites de l'API gratuite Open-Meteo (usage non commercial).

GitHub Actions actualise tous les jours à 09:17 UTC et sur déclenchement manuel, valide les calculs, versionne les données et publie GitHub Pages. L'horaire peut être retardé par GitHub. En cas d'échec, le dernier déploiement reste accessible. Les dates de données et de collecte sont visibles dans le site ; les échecs sont visibles dans Actions. Aucun accès local ni ordinateur allumé n'est nécessaire.
