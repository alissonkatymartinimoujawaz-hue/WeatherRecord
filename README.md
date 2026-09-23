# WeatherRecord : NASA quotidienne, ERA5 archivée séparément

La configuration active est `.github/workflows/daily.yml` : collecte NASA POWER,
validation indépendante, puis publication GitHub Pages à 09:17 UTC chaque jour.
Les anciens collecteurs `update_weather.py` et `update_nasa.py` ne sont plus programmés.

## Régions et sources

`site/data/regions.json` donne les coordonnées demandées, sources municipales et limites géographiques.
Sul de Minas : quatre points à poids égaux. Patrocínio représente un point du Cerrado,
Manhuaçu un point des Matas de Minas, São Mateus un point de l’Espírito Santo.
Les trois nouveaux points ne sont pas des moyennes surfaciques de leurs régions.
Patrocínio et Manhuaçu sont les deux premières municipalités caféières de Minas Gerais
dans le classement IBGE/PAM 2024 repris par SEAPA (mai 2026, source dans la configuration).

NASA POWER / MERRA-2 : résolution native 0,5° latitude × 0,625° longitude.
API `https://power.larc.nasa.gov/api/temporal/daily/point` :
`community=AG`, `parameters=PRECTOTCORR,T2M,T2M_MIN,T2M_MAX,GWETROOT`,
`latitude`, `longitude`, `start=YYYYMMDD`, `end=YYYYMMDD`, `format=JSON`, `time-standard=LST`.
Unités respectives : mm/jour, °C, °C, °C, fraction 0–1.
GWETROOT est un indicateur d’humidité relative racinaire (0–100 cm), pas une teneur volumique.
La géométrie retournée par POWER reprend le point demandé ; elle ne prouve pas une résolution à l’échelle de la ville.
Boa Esperança et Guapé partagent la même maille : une requête est réutilisée avec les deux poids.
Des contrôles directs de Guapé en janvier 2014 et septembre 2026 sont conservés dans `spot_checks.json`.

ERA5 est un instantané séparé pour Sul de Minas, arrêté au dernier jour ERA5 de la collecte
du 21 septembre 2026. La fin IFS de l’ancien tableau est exclue. Aucun abonnement ni
nouvelle requête Open-Meteo n’est utilisé par le traitement quotidien. Son calendrier
America/Sao_Paulo diffère du temps solaire local de POWER.

## Calculs et intégrité

Historique depuis le 1er janvier 1981. Moyenne des points à poids égaux, uniquement si
tous les points sont présents pour la variable. Pluie mensuelle : somme ; températures
et humidité : moyenne des jours. Les mois non complets restent nuls dans les exports mensuels.
Normales mensuelles : moyenne des 30 mois de même nom de 1991–2020. Normales quotidiennes :
même jour du calendrier sur 30 ans (8 pour le 29 février). Anomalie = valeur − normale.
Le graphique de l’année récente calcule le mois en cours sur les jours effectivement
publiés ; toutes les années et leur normale utilisent alors la même fenêtre, indiquée sur l’axe.
Les cumuls suivent le calendrier réel de chaque année et s’arrêtent dès un jour absent.
Aucune interpolation ou annualisation ; aucune valeur future créée.

Les réponses brutes compressées sont dans `site/data/**/raw/`. Les manifestes
`nasa_provenance.json` conservent URL, coordonnées, paramètres, dates de collecte et SHA-256.
Les caches par point, exports JSON/CSV et rapports `audit.json` sont versionnés.
`validate_nasa.py` reconstruit le cache depuis toutes les réponses brutes, recalcule chaque
valeur régionale puis vérifie toutes les agrégations et normales avec des calculs indépendants.
La validation porte sur la transcription et l’arithmétique ; aucun étalonnage contre des
stations locales n’a été réalisé. Les données de grille peuvent différer d’une parcelle.

## Reproduire

Python 3.12+, bibliothèque standard :

```sh
python scripts/update_nasa_daily.py
python scripts/validate_nasa.py
python -m http.server 8765 --directory site
```

`--region sul|cerrado|matas|sao-mateus` limite la collecte. Conserver les caches pour
revérifier les 100 derniers jours demandés ; dans une copie, un cache absent déclenche
le rechargement depuis 1981. Une valeur retirée par NASA redevient manquante.
Un échec de collecte ou validation empêche la publication de cette exécution.
Les observations récentes et anciennes peuvent être révisées par le fournisseur.
Le site affiche séparément la date de collecte et la dernière date de données.

Attribution : NASA POWER, ECMWF/Copernicus et Open-Meteo pour l’archive ERA5,
IBGE pour les coordonnées, D3 (ISC) pour les graphiques. D3 7.9.0 est fourni localement
avec sa licence pour éviter une dépendance à un CDN lors de l’affichage.


## Station review — 23 September 2026

The default Stations & quality view covers all nine requested city points separately.
Seven INMET automatic-station archives (142 station-year CSV files, 2006–2026 where
available) and eight NOAA GSOD archives are retained separately from NASA. INMET
station A531 is a 33 km proxy for Carmo de Minas, not a measurement in that city.
The closer Sao Lourenco GSOD files retrieved cover only 1992–1996; the catalogue's
later end date does not guarantee downloadable GSOD coverage. Bao Loc has no verified
local station series: the coastal Phan Thiet proxy is rejected. Boa Esperanca and
Guape have distant proxies explicitly marked as context only.

INMET hourly precipitation and extrema apply to the preceding hour: they are assigned
to that hour before aggregation into UTC days. Instantaneous hourly temperatures
are averaged over UTC hours 00–23. A full daily aggregate requires 24 valid hours per
variable; a full monthly aggregate requires every calendar day for that variable.
Purple dots retain observed extremes from partial days without calling them full-day
extremes. NOAA Fahrenheit/inch data are converted to Celsius/mm; only precipitation
flags D/F/G are accepted as explicit 24-hour totals. Source flags are retained.
GSOD reporting windows and NASA local solar time differ from INMET UTC. No sources
are spliced, no station normal is invented, no gap is zero-filled, and no automatic
bias correction is applied. Raw archives, hashes and historical INMET coordinates
are downloadable. Current catalogue coordinates determine displayed distances.

Station archives are a dated review, not a second daily collector. The existing daily
workflow refreshes NASA once, builds the nine city views from that same cache, and
validates station archives plus all regional/city arithmetic before publishing.
For a deliberate future station archive refresh, run in order:
`python scripts/review_stations.py`, `python scripts/collect_inmet_review.py`,
`python scripts/build_inmet_review.py`, `python scripts/validate_station_review.py`.
`cache/station-review` retains the station selection inputs and NOAA documentation.
Temporary downloaded/extracted members live in the parent work/station-review folder.
