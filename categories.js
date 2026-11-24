// Rayons et dictionnaire de base. Les corrections de la famille s'ajoutent par-dessus.
window.CATS = [
  { id: "fruits",   n: "Fruits et légumes" },
  { id: "pain",     n: "Boulangerie" },
  { id: "viande",   n: "Viande, poisson et traiteur" },
  { id: "laitiers", n: "Produits laitiers, œufs et fromages" },
  { id: "frais",    n: "Plats frais et pâtes fraîches" },
  { id: "epicerie", n: "Épicerie (pâtes, riz, conserves)" },
  { id: "dej",      n: "Petit-déjeuner et café" },
  { id: "snacks",   n: "Chocolat, biscuits et snacks" },
  { id: "boissons", n: "Boissons" },
  { id: "surgeles", n: "Surgelés" },
  { id: "menage",   n: "Ménage et nettoyage" },
  { id: "hygiene",  n: "Hygiène et beauté" },
  { id: "bebe",     n: "Bébé et animaux" },
  { id: "divers",   n: "Divers (papeterie, piles, fleurs)" }
];

window.STORES = [
  { id: "chailly",           g: "Migros", n: "Migros Chailly" },
  { id: "epalinges",         g: "Migros", n: "Migros Epalinges" },
  { id: "coop-chailly",      g: "Coop",   n: "Coop Chailly" },
  { id: "coop-epalinges",    g: "Coop",   n: "Coop Epalinges" },
  { id: "coop-oron",         g: "Coop",   n: "Coop Oron" },
  { id: "coop-savigny",      g: "Coop",   n: "Coop Savigny" },
  { id: "denner-bethusy",    g: "Denner", n: "Denner Béthusy" },
  { id: "denner-valonnette", g: "Denner", n: "Denner Valonnette" },
  { id: "denner-epalinges",  g: "Denner", n: "Denner Epalinges" }
];

// Mots sans accents, au singulier. Le pluriel (s, x) est reconnu automatiquement.
const D = {
  fruits: "pomme poire banane orange mandarine clementine citron lime kiwi raisin fraise framboise myrtille ananas mangue avocat peche abricot prune cerise melon pasteque grenade fruit tomate salade laitue roquette mache epinard concombre courgette aubergine poivron carotte poireau oignon echalote ail pomme de terre patate celeri fenouil brocoli chou chou-fleur champignon radis betterave courge potiron butternut asperge haricot petit pois mais gingembre herbe persil basilic ciboulette coriandre menthe legume",
  pain: "pain baguette tresse croissant brioche petit pain toast pain de mie pain complet ballon zopf viennoiserie gateau tarte cake",
  viande: "viande poulet dinde boeuf porc veau agneau steak escalope emince hache saucisse cervelas jambon lard bacon salami viande sechee charcuterie poisson saumon thon frais cabillaud crevette fruits de mer cordon bleu",
  laitiers: "lait beurre creme yogourt yaourt sere fromage gruyere emmental vacherin tomme raclette parmesan mozzarella feta ricotta mascarpone cottage cheese oeuf oeufs fromage blanc kefir",
  frais: "pesto ravioli tortellini gnocchi pate fraiche tofu houmous hummus sauce fraiche salade preparee sandwich pizza fraiche pate a pizza pate feuilletee pate brisee anna's best rosti",
  epicerie: "pate pates spaghetti penne fusilli riz risotto couscous quinoa lentille pois chiche farine sucre sel poivre huile vinaigre moutarde mayonnaise ketchup sauce tomate concentre bouillon epice conserve thon en boite olive cornichon levure maizena",
  dej: "cereale muesli flocon d'avoine confiture miel nutella pate a tartiner cafe capsule delizio the tisane chocolat en poudre ovomaltine cacao",
  snacks: "chocolat frey biscuit chips zweifel cracker noix cacahuete amande noisette fruit sec bonbon chewing-gum farmer barre",
  boissons: "eau eau minerale aproz eau gazeuse jus sirop limonade coca ice tea biere vin cidre",
  surgeles: "glace surgele frites legumes surgeles epinards surgeles pizza surgelee poisson pane",
  menage: "yvette handymatic potz total lessive adoucissant liquide vaisselle lave-vaisselle tablette lave-vaisselle pastille eponge papier menage essuie-tout sac poubelle sac a poubelle film alimentaire papier alu aluminium detergent nettoyant javel desinfectant serpillere chiffon wc canard anticalcaire",
  hygiene: "dentifrice candida brosse a dents shampoing gel douche savon deodorant creme solaire papier toilette mouchoir coton tige rasoir serviette hygienique tampon i am",
  bebe: "couche lingette lait bebe petit pot nourriture chat nourriture chien litiere croquette",
  divers: "pile ampoule fleur bougie carte enveloppe stylo"
};

window.BASE_DICT = {};
for (const [cat, words] of Object.entries(D)) {
  // Les groupes de mots sont séparés par des espaces simples; on reconnaît
  // les expressions connues listées ci-dessous en premier.
  words.split(" ").forEach(w => { if (w) window.BASE_DICT[w] = cat; });
}
// Expressions de plusieurs mots (prioritaires sur les mots seuls)
Object.assign(window.BASE_DICT, {
  "pomme de terre": "fruits", "petit pois": "fruits", "chou-fleur": "fruits",
  "petit pain": "pain", "pain de mie": "pain", "pain complet": "pain",
  "viande hachee": "viande", "viande sechee": "viande", "fruits de mer": "viande", "cordon bleu": "viande",
  "fromage blanc": "laitiers", "cottage cheese": "laitiers",
  "pate fraiche": "frais", "pate a pizza": "frais", "pate feuilletee": "frais", "pate brisee": "frais", "anna's best": "frais",
  "sauce tomate": "epicerie", "pois chiche": "epicerie", "thon en boite": "epicerie",
  "flocon d'avoine": "dej", "pate a tartiner": "dej", "chocolat en poudre": "dej",
  "fruit sec": "snacks",
  "eau minerale": "boissons", "eau gazeuse": "boissons", "ice tea": "boissons",
  "legumes surgeles": "surgeles", "pizza surgelee": "surgeles", "poisson pane": "surgeles",
  "liquide vaisselle": "menage", "lave-vaisselle": "menage", "papier menage": "menage", "essuie-tout": "menage",
  "sac poubelle": "menage", "film alimentaire": "menage", "papier alu": "menage",
  "brosse a dents": "hygiene", "gel douche": "hygiene", "creme solaire": "hygiene", "papier toilette": "hygiene",
  "coton tige": "hygiene", "serviette hygienique": "hygiene", "i am": "hygiene",
  "lait bebe": "bebe", "petit pot": "bebe", "nourriture chat": "bebe", "nourriture chien": "bebe",
  "creme": "laitiers"
});
// Mots trop ambigus seuls : on les retire
["sauce", "petit", "de", "a", "en", "pot", "sac", "film", "papier", "brosse", "gel", "coton", "tige", "serviette", "nourriture", "chat", "chien", "carte", "fruit", "frais", "boite", "poudre", "tablette", "pastille", "barre", "lait", "fraiche", "surgelee", "surgeles", "preparee", "sechee", "hachee", "minerale", "gazeuse", "pane", "boite", "en", "best", "anna's", "tartiner", "poudre", "d'avoine", "bleu", "mer", "fruits", "legumes", "epinards", "terre", "mie", "complet", "dents", "douche", "solaire", "toilette", "hygienique", "bebe", "alimentaire", "alu", "menage", "vaisselle", "liquide", "i", "am", "ice"].forEach(w => delete window.BASE_DICT[w]);
window.BASE_DICT["lait"] = "laitiers";

// Catalogue de base pour les suggestions (orthographe soignée).
// Les articles déjà achetés par la famille passent toujours avant.
window.CATALOG = [
  "Bananes","Pommes","Poires","Oranges","Mandarines","Citrons","Kiwis","Raisin","Fraises","Myrtilles","Avocats","Tomates","Tomates cerises",
  "Salade","Concombre","Courgettes","Aubergines","Poivrons","Carottes","Poireaux","Oignons","Ail","Pommes de terre","Brocoli","Champignons",
  "Épinards","Fenouil","Céleri","Gingembre","Basilic","Persil","Ciboulette",
  "Pain","Pain complet","Baguette","Tresse","Croissants","Petits pains","Pain de mie",
  "Poulet","Émincé de poulet","Viande hachée","Saucisses","Cervelas","Jambon","Lard","Salami","Viande séchée","Saumon","Saumon fumé","Thon frais","Crevettes","Cordon bleu",
  "Lait","Lait entier","Lait drink","Beurre","Crème entière","Crème à café","Crème fraîche","Yogourt nature","Yogourts","Séré","Gruyère","Emmental","Vacherin fribourgeois",
  "Tomme","Fromage à raclette","Parmesan","Mozzarella","Feta","Mascarpone","Cottage cheese","Œufs",
  "Pesto","Ravioli","Tortellini","Gnocchi","Pâte à pizza","Pâte feuilletée","Pâte brisée","Tofu","Houmous","Rösti",
  "Pâtes","Spaghetti","Penne","Riz","Riz risotto","Couscous","Quinoa","Lentilles","Pois chiches","Farine","Sucre","Sel","Poivre","Huile d'olive","Huile de colza",
  "Vinaigre","Moutarde","Mayonnaise","Ketchup","Sauce tomate","Concentré de tomates","Bouillon","Thon en boîte","Olives","Cornichons","Levure","Maïzena",
  "Céréales","Muesli","Flocons d'avoine","Confiture","Miel","Pâte à tartiner","Café en grains","Café moulu","Capsules Delizio","Thé","Tisane","Ovomaltine","Cacao",
  "Chocolat","Chocolat au lait","Chocolat noir","Biscuits","Chips","Crackers","Noix","Amandes","Noisettes","Fruits secs","Barres de céréales",
  "Eau minérale","Eau gazeuse","Aproz","Jus d'orange","Jus de pomme","Sirop","Ice tea","Bière","Vin rouge","Vin blanc",
  "Glace","Frites surgelées","Légumes surgelés","Épinards surgelés","Pizza surgelée","Petits pois surgelés","Poisson pané",
  "Yvette","Yvette wool","Yvette black","Yvette color","Handymatic","Tablettes lave-vaisselle","Liquide vaisselle","Liquide pour lave-vaisselle","Lessive","Adoucissant",
  "Éponges","Papier ménage","Sacs poubelle 35 l","Sacs poubelle 17 l","Film alimentaire","Papier alu","Nettoyant WC","Anticalcaire","Potz",
  "Dentifrice","Brosses à dents","Shampoing","Gel douche","Savon","Déodorant","Crème solaire","Papier toilette","Mouchoirs","Cotons-tiges","Rasoirs",
  "Couches","Lingettes","Nourriture chat","Litière","Piles","Ampoules","Bougies","Fleurs"
];
