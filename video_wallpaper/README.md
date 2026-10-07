# 🎬 Video Wallpaper

Un petit **Wallpaper Engine gratuit** pour Windows : il affiche une vidéo en
boucle comme fond d'écran animé, **derrière les icônes du bureau** (même
technique que le vrai Wallpaper Engine : la fenêtre *WorkerW* de Windows).

100 % local, aucune pub, aucun tracker, rien d'intégré en douce.

## ✨ Fonctions

- Vidéo en boucle en fond d'écran, icônes du bureau toujours cliquables
- Icône dans la barre des tâches pour :
  - changer de wallpaper
  - couper / activer le son
  - rafraîchir la liste
  - quitter proprement
- Retient ton dernier wallpaper et le réglage du son

## 🚀 Installation

1. Installe [Python 3.10+](https://www.python.org/downloads/) (coche
   *« Add Python to PATH »* à l'installation).
2. Télécharge ce dossier `video_wallpaper/`.
3. Double-clique sur **`lancer.bat`** — il installe les dépendances la
   première fois, puis démarre l'app.

Ou en ligne de commande :

```bash
pip install -r requirements.txt
python main.py
```

## 📂 Ajouter des wallpapers

Dépose tes fichiers vidéo (`.mp4`, `.webm`, `.mkv`, `.mov`, `.avi`, `.m4v`)
dans le dossier **`wallpapers/`**, puis clique sur l'icône dans la barre des
tâches → choisis ta vidéo.

> ⚠️ **Droits d'auteur** : l'app ne contient aucune vidéo. Pour des live
> wallpapers libres de droits : [Pixabay](https://pixabay.com/videos/),
> [Pexels](https://www.pexels.com/videos/), [Coverr](https://coverr.co/).
> Les clips d'anime/films protégés : usage personnel uniquement, ne les
> redistribue pas.

## ⚙️ Comment ça marche

Windows dessine le bureau via un processus nommé *Progman*. En lui envoyant un
message système (`0x052C`), on force la création d'une fenêtre *WorkerW* placée
juste **derrière la couche des icônes**. L'app attache sa fenêtre vidéo à ce
*WorkerW* : la vidéo passe en fond sans jamais masquer tes icônes.

## 📝 Notes

- **Windows uniquement** (la technique WorkerW est spécifique à Windows). Sur
  un autre OS, la vidéo s'affichera en fenêtre normale.
- Pour économiser batterie/CPU sur un portable, préfère des clips courts en
  720p plutôt que de la 4K.
- Multi-écrans : la version actuelle couvre l'écran principal.
