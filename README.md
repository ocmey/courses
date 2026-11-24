# Courses en famille, V1

Liste de courses partagée pour 4 iPhone, triée par rayon dans l'ordre de chaque magasin : Migros (Chailly, Epalinges), Coop (Chailly, Epalinges, Oron, Savigny), Denner (Béthusy, Valonnette, Epalinges).

## Ce que fait la V1
- Ajout en tapant, avec la quantité : « 2 l lait », « 500 g de gruyère ».
- Suggestions pendant la saisie : d'abord les articles déjà achetés par la famille (avec leur quantité habituelle), puis un catalogue d'environ 190 articles courants. Champ vide = les « habituels » qui ne sont pas encore sur la liste.
- Produits migros.ch dans les suggestions (vrais noms, marques, photo), dès 3 lettres tapées. Si Migros bloque ou change son site, l'app continue sans.
- Classement automatique par rayon. Si un article tombe mal ou dans « À classer », tu choisis le rayon une fois et l'app le retient pour toute la famille.
- Vue « En magasin » : choix du magasin, rayons dans l'ordre de ce magasin, gros boutons, les articles cochés descendent.
- « Rayons » : tu règles l'ordre avec les flèches, une fois par magasin.
- Magasins situés d'office à partir de leurs adresses (categories.js, converties en GPS par geo.admin.ch au premier lancement ; liste dans le menu ⋯, chaque adresse s'ouvre dans Plans). Migros Chailly et Denner Valonnette sont dans le même bâtiment : la flèche propose de passer de l'un à l'autre. Le bouton flèche te situe, choisit le magasin le plus proche et indique sa distance. Le mode « En magasin » choisit aussi tout seul le magasin à moins de 250 m.
- Retirer un article des suggestions : appui long sur la suggestion, puis « Retirer ». Un article supprimé (glisser) sans avoir été acheté et ajouté une seule fois est retiré automatiquement.
- Scanner de code-barres (bouton à gauche du champ) : cherche le produit sur migros.ch puis Open Food Facts, montre ce qu'il a trouvé avant d'ajouter.
- Photo prise avec le téléphone pour un article sans photo (touche l'article > 📷 Photo).
- Fonctionne sans réseau, puis se resynchronise.
- Chaque coche en magasin est enregistrée, pour apprendre l'ordre automatiquement en V2.

Sans configuration (config.js vide), l'app tourne en mode démo, sur un seul téléphone.

## Mise en route (environ 30 minutes, sur ordinateur)

**1. Supabase (la base de données)**
1. Crée un compte sur supabase.com, puis « New project ». Région : Europe (Zurich si proposée, sinon Francfort). Note le mot de passe quelque part.
2. Menu « SQL Editor » > « New query ». Colle tout le fichier `supabase/schema.sql` et clique « Run ».
3. Menu « Authentication » > « Sign In / Providers » > « Email » : désactive « Confirm email » et enregistre. (Connexion par e-mail et mot de passe. Le plan gratuit ne permet pas de modifier les e-mails, et un lien de connexion marche mal avec une app installée sur l'iPhone.)
4. Recherche Migros : menu « Edge Functions » > « Deploy a new function » > « Via Editor », nom `migros`, colle le contenu de `supabase/functions/migros/index.ts`, puis « Deploy ». Test : ouvre `https://<ton-projet>.supabase.co/functions/v1/migros?q=yvette&debug=1` connecté dans l'app, ou demande-moi. (Si l'éditeur en ligne n'est pas proposé, je la déploie avec l'outil en ligne de commande.)
5. Menu « Project Settings » > « API » : copie « Project URL » et la clé « anon public » dans `config.js`.

**2. GitHub (l'hébergement des pages, gratuit)**
1. Crée un dépôt « courses » sur ton compte. Dis-le-moi et je pousse les fichiers, ou glisse-les toi-même dans le dépôt.
2. Dans le dépôt : Settings > Pages > Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'app sera à l'adresse `https://ocmey.github.io/courses/`.

**3. Sur chaque iPhone**
1. Ouvre l'adresse dans Safari > bouton Partager > « Sur l'écran d'accueil ».
2. Toi d'abord : ton e-mail, un mot de passe, « Créer mon compte », puis ton prénom, sans code. L'app crée la famille. Le code à partager est dans le menu ⋯.
3. Les 3 autres : leur e-mail, leur mot de passe, « Créer mon compte », leur prénom et ce code.

**4. Au premier passage dans chaque magasin**
Mode « En magasin » > vérifie le magasin choisi > « Rayons », et mets les rayons dans l'ordre où tu passes devant. À faire une fois pour chacun des 9 magasins.

## À savoir
- Supabase gratuit met le projet en pause après 7 jours sans aucune activité (vacances, par exemple). Il se réactive en un clic depuis le tableau de bord, les données restent.
- La clé « anon » dans config.js peut être publique : chaque famille ne voit que ses propres données (testé).
- Après une modification des fichiers, change `VERSION` dans `sw.js` et le `?v=` des fichiers dans `index.html`, sinon les iPhone peuvent mélanger ancienne et nouvelle version.

## Fichiers
- `index.html`, `style.css`, `app.js` : l'app.
- `vendor/html5-qrcode.min.js` : lecteur de code-barres (licence Apache 2.0), chargé au premier scan.
- `categories.js` : les rayons, les deux magasins et le dictionnaire de base (environ 300 mots, dont les marques Migros courantes).
- `config.js` : les deux valeurs Supabase.
- `sw.js`, `manifest.webmanifest`, icônes : installation sur l'écran d'accueil et mode hors ligne.
- `supabase/schema.sql` : tables, règles d'accès par famille, temps réel, cache Migros.
- `supabase/functions/migros/index.ts` : recherche sur migros.ch, résultats gardés 7 jours.
