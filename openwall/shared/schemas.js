// Définition des propriétés personnalisables de chaque type de fond d'écran et des scènes intégrées.
// Partagé entre le processus principal (Node), l'interface et le moteur de rendu.
(function (root) {
  const FIT = ['combo', 'fit', 'Ajustement', 'cover', { options: [['cover', 'Remplir'], ['contain', 'Ajuster'], ['fill', 'Étirer'], ['none', 'Centrer']] }];

  // Raccourci : [type, clé, libellé, défaut, extra]
  function P(type, key, label, def, extra) {
    return Object.assign({ type, key, label, default: def }, extra || {});
  }
  function fromArr(a) {
    return P(a[0], a[1], a[2], a[3], a[4]);
  }

  const ADJUST = {
    title: 'Ajustements de l’image',
    props: [
      P('slider', 'brightness', 'Luminosité', 100, { min: 0, max: 200, step: 1, unit: '%' }),
      P('slider', 'contrast', 'Contraste', 100, { min: 0, max: 200, step: 1, unit: '%' }),
      P('slider', 'saturation', 'Saturation', 100, { min: 0, max: 200, step: 1, unit: '%' }),
      P('slider', 'hue', 'Teinte', 0, { min: -180, max: 180, step: 1, unit: '°' }),
      P('slider', 'blur', 'Flou', 0, { min: 0, max: 30, step: 0.5, unit: 'px' }),
      P('slider', 'vignette', 'Vignettage', 0, { min: 0, max: 100, step: 1, unit: '%' }),
      P('bool', 'mirror', 'Miroir horizontal', false)
    ]
  };

  const OVERLAYS = {
    title: 'Superpositions',
    props: [
      P('bool', 'overlayClock', 'Afficher l’horloge', false),
      P('combo', 'clockFormat', 'Format', '24', { options: [['24', '24 heures'], ['12', '12 heures (AM/PM)']], showIf: 'overlayClock' }),
      P('bool', 'clockSeconds', 'Secondes', false, { showIf: 'overlayClock' }),
      P('bool', 'clockDate', 'Afficher la date', true, { showIf: 'overlayClock' }),
      P('combo', 'clockPosition', 'Position', 'center', {
        options: [['center', 'Centre'], ['top-left', 'Haut gauche'], ['top-center', 'Haut centre'], ['top-right', 'Haut droite'],
          ['bottom-left', 'Bas gauche'], ['bottom-center', 'Bas centre'], ['bottom-right', 'Bas droite']],
        showIf: 'overlayClock'
      }),
      P('slider', 'clockSize', 'Taille', 96, { min: 24, max: 260, step: 1, unit: 'px', showIf: 'overlayClock' }),
      P('color', 'clockColor', 'Couleur', '#ffffff', { showIf: 'overlayClock' }),
      P('bool', 'clockShadow', 'Ombre', true, { showIf: 'overlayClock' }),
      P('bool', 'overlayVisualizer', 'Visualiseur audio', false),
      P('combo', 'vizPosition', 'Position', 'bottom', { options: [['bottom', 'En bas'], ['top', 'En haut'], ['center', 'Au centre']], showIf: 'overlayVisualizer' }),
      P('slider', 'vizHeight', 'Hauteur', 18, { min: 5, max: 60, step: 1, unit: '%', showIf: 'overlayVisualizer' }),
      P('slider', 'vizBars', 'Nombre de barres', 64, { min: 16, max: 128, step: 1, showIf: 'overlayVisualizer' }),
      P('color', 'vizColor', 'Couleur', '#7fd1ff', { showIf: 'overlayVisualizer' }),
      P('slider', 'vizOpacity', 'Opacité', 80, { min: 10, max: 100, step: 1, unit: '%', showIf: 'overlayVisualizer' })
    ]
  };

  const TYPE_SCHEMAS = {
    video: [
      {
        title: 'Lecture',
        props: [
          fromArr(FIT),
          P('slider', 'speed', 'Vitesse de lecture', 1, { min: 0.1, max: 3, step: 0.05, unit: '×' }),
          P('slider', 'volume', 'Volume', 0, { min: 0, max: 100, step: 1, unit: '%' }),
          P('slider', 'startAt', 'Commencer à', 0, { min: 0, max: 100, step: 1, unit: '%' }),
          P('combo', 'align', 'Alignement', 'center', { options: [['center', 'Centre'], ['top', 'Haut'], ['bottom', 'Bas'], ['left', 'Gauche'], ['right', 'Droite']] }),
          P('color', 'background', 'Couleur de fond', '#000000')
        ]
      },
      ADJUST,
      OVERLAYS
    ],
    image: [
      {
        title: 'Affichage',
        props: [
          fromArr(FIT),
          P('combo', 'align', 'Alignement', 'center', { options: [['center', 'Centre'], ['top', 'Haut'], ['bottom', 'Bas'], ['left', 'Gauche'], ['right', 'Droite']] }),
          P('bool', 'kenBurns', 'Zoom lent (Ken Burns)', false),
          P('slider', 'kenBurnsSpeed', 'Durée du zoom', 30, { min: 5, max: 120, step: 1, unit: 's', showIf: 'kenBurns' }),
          P('bool', 'parallax', 'Parallaxe à la souris', true),
          P('slider', 'parallaxStrength', 'Intensité parallaxe', 25, { min: 0, max: 100, step: 1, unit: '%', showIf: 'parallax' }),
          P('color', 'background', 'Couleur de fond', '#000000')
        ]
      },
      ADJUST,
      OVERLAYS
    ],
    web: [
      {
        title: 'Page web',
        props: [
          P('slider', 'zoom', 'Zoom', 100, { min: 25, max: 300, step: 5, unit: '%' }),
          P('slider', 'refresh', 'Actualiser toutes les', 0, { min: 0, max: 120, step: 1, unit: ' min', zeroLabel: 'Jamais' }),
          P('color', 'background', 'Couleur de fond', '#000000')
        ]
      },
      ADJUST,
      OVERLAYS
    ]
  };

  // ---- Scènes intégrées (équivalent des fonds « Scène » / Atelier) ----
  const SCENES = {
    constellation: {
      title: 'Constellation',
      description: 'Particules reliées entre elles qui réagissent à la souris et au son.',
      tags: ['Abstrait', 'Interactif', 'Audio'],
      props: [
        P('slider', 'count', 'Nombre de particules', 140, { min: 20, max: 500, step: 1 }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'size', 'Taille', 2.2, { min: 0.5, max: 8, step: 0.1, unit: 'px' }),
        P('slider', 'linkDistance', 'Distance des liens', 140, { min: 0, max: 320, step: 1, unit: 'px' }),
        P('color', 'particleColor', 'Couleur des particules', '#8fd3ff'),
        P('color', 'lineColor', 'Couleur des liens', '#4aa3ff'),
        P('color', 'background', 'Fond', '#060b1a'),
        P('color', 'background2', 'Fond (dégradé)', '#141a3a'),
        P('combo', 'mouse', 'Souris', 'attract', { options: [['attract', 'Attirer'], ['repel', 'Repousser'], ['none', 'Aucune']] }),
        P('bool', 'audioReactive', 'Réagir au son', true)
      ]
    },
    starfield: {
      title: 'Hyperespace',
      description: 'Voyage à travers les étoiles, dirigé par la souris.',
      tags: ['Espace', 'Interactif'],
      props: [
        P('slider', 'count', 'Étoiles', 700, { min: 100, max: 3000, step: 10 }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 6, step: 0.1, unit: '×' }),
        P('color', 'color', 'Couleur des étoiles', '#ffffff'),
        P('color', 'tint', 'Teinte de vitesse', '#7ab8ff'),
        P('color', 'background', 'Fond', '#000005'),
        P('slider', 'trails', 'Traînées', 60, { min: 0, max: 95, step: 1, unit: '%' }),
        P('bool', 'mouseSteer', 'Diriger avec la souris', true),
        P('bool', 'audioReactive', 'Accélérer avec le son', true)
      ]
    },
    matrix: {
      title: 'Pluie numérique',
      description: 'Cascade de caractères façon terminal.',
      tags: ['Code', 'Rétro'],
      props: [
        P('color', 'color', 'Couleur', '#22ff66'),
        P('color', 'headColor', 'Couleur de tête', '#d8ffe3'),
        P('color', 'background', 'Fond', '#000000'),
        P('slider', 'fontSize', 'Taille du texte', 18, { min: 8, max: 48, step: 1, unit: 'px' }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'fade', 'Persistance', 90, { min: 50, max: 99, step: 1, unit: '%' }),
        P('combo', 'charset', 'Caractères', 'katakana', { options: [['katakana', 'Katakana'], ['binary', 'Binaire'], ['latin', 'Latin'], ['hex', 'Hexadécimal']] })
      ]
    },
    visualizer: {
      title: 'Visualiseur audio',
      description: 'Spectre audio en direct de ce que joue votre PC.',
      tags: ['Audio', 'Musique'],
      props: [
        P('combo', 'style', 'Style', 'bars', { options: [['bars', 'Barres'], ['mirror', 'Barres miroir'], ['circle', 'Cercle'], ['wave', 'Onde']] }),
        P('slider', 'bars', 'Nombre de barres', 96, { min: 16, max: 256, step: 1 }),
        P('slider', 'sensitivity', 'Sensibilité', 1.2, { min: 0.2, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'smoothing', 'Lissage', 60, { min: 0, max: 95, step: 1, unit: '%' }),
        P('color', 'colorA', 'Couleur 1', '#00e5ff'),
        P('color', 'colorB', 'Couleur 2', '#ff3df2'),
        P('color', 'background', 'Fond', '#05030f'),
        P('bool', 'glow', 'Lueur', true)
      ]
    },
    aurora: {
      title: 'Aurore boréale',
      description: 'Rubans de lumière ondulants dans un ciel étoilé.',
      tags: ['Nature', 'Calme'],
      props: [
        P('color', 'colorA', 'Couleur 1', '#2bffa8'),
        P('color', 'colorB', 'Couleur 2', '#3a7bff'),
        P('color', 'colorC', 'Couleur 3', '#b14dff'),
        P('color', 'background', 'Ciel', '#020814'),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'amplitude', 'Amplitude', 60, { min: 10, max: 150, step: 1 }),
        P('slider', 'layers', 'Couches', 4, { min: 1, max: 8, step: 1 }),
        P('bool', 'stars', 'Étoiles', true)
      ]
    },
    rain: {
      title: 'Pluie et orage',
      description: 'Pluie battante avec éclairs aléatoires.',
      tags: ['Nature', 'Météo'],
      props: [
        P('slider', 'drops', 'Gouttes', 600, { min: 50, max: 2000, step: 10 }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.2, max: 3, step: 0.1, unit: '×' }),
        P('slider', 'wind', 'Vent', 1, { min: -6, max: 6, step: 0.1 }),
        P('color', 'color', 'Couleur des gouttes', '#9fb8d8'),
        P('color', 'background', 'Fond', '#0b1018'),
        P('color', 'background2', 'Fond (dégradé)', '#1d2a3c'),
        P('bool', 'lightning', 'Éclairs', true),
        P('bool', 'splash', 'Éclaboussures', true),
        P('bool', 'mouseWind', 'Vent à la souris', true)
      ]
    },
    snow: {
      title: 'Neige',
      description: 'Flocons qui tombent doucement, poussés par la souris.',
      tags: ['Nature', 'Hiver', 'Calme'],
      props: [
        P('slider', 'flakes', 'Flocons', 400, { min: 50, max: 2000, step: 10 }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'size', 'Taille', 3, { min: 1, max: 10, step: 0.5, unit: 'px' }),
        P('slider', 'wind', 'Vent', 0.3, { min: -3, max: 3, step: 0.1 }),
        P('color', 'color', 'Couleur', '#ffffff'),
        P('color', 'background', 'Fond', '#0d1b2e'),
        P('color', 'background2', 'Fond (dégradé)', '#3b5779'),
        P('bool', 'mouseWind', 'Vent à la souris', true)
      ]
    },
    fireflies: {
      title: 'Lucioles',
      description: 'Lucioles lumineuses qui suivent votre curseur.',
      tags: ['Nature', 'Calme', 'Interactif'],
      props: [
        P('slider', 'count', 'Lucioles', 90, { min: 10, max: 400, step: 1 }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'glow', 'Lueur', 14, { min: 2, max: 40, step: 1, unit: 'px' }),
        P('color', 'color', 'Couleur', '#ffe27a'),
        P('color', 'background', 'Fond', '#03100b'),
        P('color', 'background2', 'Fond (dégradé)', '#0b2a1d'),
        P('bool', 'followMouse', 'Suivre la souris', true)
      ]
    },
    bokeh: {
      title: 'Bokeh',
      description: 'Cercles de lumière flous et colorés.',
      tags: ['Abstrait', 'Calme'],
      props: [
        P('slider', 'count', 'Cercles', 45, { min: 5, max: 200, step: 1 }),
        P('slider', 'size', 'Taille', 60, { min: 10, max: 200, step: 1, unit: 'px' }),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'hueStart', 'Teinte début', 190, { min: 0, max: 360, step: 1, unit: '°' }),
        P('slider', 'hueRange', 'Plage de teintes', 120, { min: 0, max: 360, step: 1, unit: '°' }),
        P('color', 'background', 'Fond', '#0a0614'),
        P('bool', 'audioReactive', 'Réagir au son', true)
      ]
    },
    gradient: {
      title: 'Dégradé fluide',
      description: 'Formes colorées qui se mélangent lentement.',
      tags: ['Abstrait', 'Minimaliste'],
      props: [
        P('color', 'colorA', 'Couleur 1', '#ff5f6d'),
        P('color', 'colorB', 'Couleur 2', '#ffc371'),
        P('color', 'colorC', 'Couleur 3', '#5f72ff'),
        P('color', 'colorD', 'Couleur 4', '#2af5c8'),
        P('color', 'background', 'Fond', '#140c2a'),
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'blobSize', 'Taille des formes', 55, { min: 20, max: 100, step: 1, unit: '%' })
      ]
    },
    plasma: {
      title: 'Plasma',
      description: 'Shader GPU psychédélique et hypnotique.',
      tags: ['Shader', 'Abstrait', 'Audio'],
      props: [
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'scale', 'Échelle', 3, { min: 0.5, max: 10, step: 0.1 }),
        P('color', 'colorA', 'Couleur 1', '#ff2e88'),
        P('color', 'colorB', 'Couleur 2', '#2ee6ff'),
        P('color', 'colorC', 'Couleur 3', '#1a0b3d'),
        P('bool', 'audioReactive', 'Réagir au son', true),
        P('bool', 'mouseWarp', 'Déformation à la souris', true)
      ]
    },
    nebula: {
      title: 'Nébuleuse',
      description: 'Nuages cosmiques procéduraux (shader GPU).',
      tags: ['Shader', 'Espace'],
      props: [
        P('slider', 'speed', 'Vitesse', 1, { min: 0.1, max: 4, step: 0.1, unit: '×' }),
        P('slider', 'density', 'Densité', 1, { min: 0.3, max: 2.5, step: 0.05 }),
        P('color', 'colorA', 'Couleur 1', '#5b2bff'),
        P('color', 'colorB', 'Couleur 2', '#ff4fa3'),
        P('color', 'colorC', 'Couleur 3', '#00d0ff'),
        P('slider', 'stars', 'Étoiles', 60, { min: 0, max: 100, step: 1, unit: '%' }),
        P('bool', 'mouseParallax', 'Parallaxe à la souris', true)
      ]
    }
  };

  function schemaFor(item) {
    if (!item) return [];
    if (item.type === 'scene') {
      const s = SCENES[item.scene];
      if (!s) return [];
      return [{ title: 'Propriétés de la scène', props: s.props }, ADJUST, OVERLAYS];
    }
    return TYPE_SCHEMAS[item.type] || [];
  }

  function defaultsFor(item) {
    const out = {};
    for (const group of schemaFor(item)) for (const p of group.props) out[p.key] = p.default;
    return out;
  }

  function resolveProps(item) {
    return Object.assign(defaultsFor(item), (item && item.properties) || {});
  }

  function builtinItems() {
    return Object.entries(SCENES).map(([id, s], i) => ({
      id: 'scene-' + id,
      type: 'scene',
      scene: id,
      title: s.title,
      description: s.description,
      tags: s.tags.slice(),
      builtin: true,
      properties: {},
      createdAt: Date.UTC(2026, 0, 1) + i * 1000
    }));
  }

  const api = { SCENES, TYPE_SCHEMAS, ADJUST, OVERLAYS, schemaFor, defaultsFor, resolveProps, builtinItems };
  root.OWSchemas = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
