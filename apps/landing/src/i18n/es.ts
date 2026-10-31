import type { Dictionary } from "./en"

/**
 * Spanish copy. Facts and product wording follow the app's own messages in
 * `apps/web/messages/es.json`.
 */
export const es: Dictionary = {
  meta: {
    title: "numa: crea videojuegos describiéndolos",
    description:
      "Crea tus propios juegos de carreras, disparos, rompecabezas y mundos enteros con tus propias palabras. Si puedes describirlo, puedes jugarlo.",
  },
  skip: "Saltar al contenido",
  nav: {
    home: "Inicio de numa",
    templates: "Plantillas",
    howItWorks: "Cómo funciona",
    pricing: "Precios",
    faq: "Preguntas",
    signIn: "Entrar",
    start: "Empieza gratis",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
  },
  hero: {
    badge: "Seis plantillas para juegos 2D y 3D",
    title: ["Describe tu juego.", "numa lo construye."],
    subtitle:
      "Carreras, shooters, puzles o mundos enteros. Cuéntaselo a un agente de IA y te lo devuelve jugable en el navegador.",
    proof: "Gratis para empezar: 100 créditos al mes.",
    sceneLabel:
      "Una isla flotante hecha de bloques, con árboles, una bandera y animales paseando por el prado.",
  },
  composer: {
    label: "Describe el juego que quieres jugar",
    placeholder: "Una isla pirata donde busco tesoros antes de que suba la marea…",
    submit: "Crear mi juego",
    empty: "Primero describe tu juego.",
    try: "Prueba con",
  },
  suggestions: [
    {
      label: "Supervivencia voxel",
      prompt:
        "Crea un juego de supervivencia voxel en primera persona: quiero extraer y colocar bloques en un mundo que pueda recorrer, reunir lo necesario antes del anochecer y sobrevivir.",
    },
    {
      label: "Duelo de samuráis a tinta",
      prompt:
        "Crea un duelo de samuráis uno contra uno con estética de tinta en blanco y negro. Los combates se ganan al calcular bien el momento de parar un ataque y lanzar el contraataque.",
    },
    {
      label: "Ruta todoterreno por la jungla",
      prompt:
        "Crea un juego de conducción por una jungla frondosa: quiero recorrer caminos todoterreno con barro, cruces de ríos y pendientes pronunciadas, donde mantener el vehículo intacto importe tanto como la velocidad.",
    },
    {
      label: "Plataformas en un reino soleado",
      prompt:
        "Crea un plataformas 3D luminoso en un reino de cuento bañado por el sol: quiero correr, saltar y hacer doble salto entre islas flotantes para recoger los objetos repartidos por cada una.",
    },
  ],
  tagline: ["Si puedes describirlo,", "puedes jugarlo."],
  how: {
    eyebrow: "Cómo funciona",
    title: "De una frase a un juego que puedes jugar",
    steps: [
      {
        title: "Descríbelo",
        body: "Una frase basta. Añade referencias si las tienes y elige una plantilla o empieza desde un lienzo en blanco.",
      },
      {
        title: "El agente lo construye",
        body: "Planifica el juego, escribe el código, monta la escena con assets reales y comprueba que funciona.",
      },
      {
        title: "Juégalo y cámbialo",
        body: "El juego corre al lado del chat. Pide cambios con tus palabras y juega la nueva versión.",
      },
    ],
    demo: {
      prompt: "Un juego de pastorear ovejas en una isla flotante",
      plan: "Planificando el juego",
      code: "Escribiendo el código",
      scene: "Montando la escena",
      verify: "Comprobando que funciona",
      play: "Jugar",
    },
  },
  templates: {
    eyebrow: "Plantillas",
    title: "Empieza desde un mundo que ya se ve bien",
    subtitle:
      "Cada plantilla trae un kit de modelos y sprites reales, así que tu primera versión ya tiene dirección de arte.",
    items: [
      { id: "cube-world", name: "Mundo de cubos", tagline: "Un mundo 3D de bloques con héroes, animales y monstruos.", kind: "3D" },
      { id: "platformer", name: "Plataformas", tagline: "Plataformas, monedas y enemigos 3D de colores vivos.", kind: "3D" },
      { id: "toon-shooter", name: "Disparos cartoon", tagline: "Soldados, armas y campos de batalla 3D de estilo cartoon.", kind: "3D" },
      { id: "fantasy-cards", name: "Cartas de fantasía", tagline: "Cartas 3D de fantasía con hechizos, criaturas y tesoros.", kind: "3D" },
      { id: "tiny-swords", name: "Tiny Swords", tagline: "Un reino 2D en pixel art visto desde arriba.", kind: "2D" },
      { id: "legacy-fantasy", name: "Legacy Fantasy", tagline: "Una aventura 2D en pixel art por el bosque, en vista lateral.", kind: "2D" },
    ],
  },
  benefits: {
    eyebrow: "Por qué numa",
    title: "Todo lo que un juego necesita, sin montar nada",
    items: [
      {
        title: "Sin escribir código",
        body: "Tú pones la idea. El agente escribe cada archivo, y puedes abrirlos y leerlos cuando quieras.",
      },
      {
        title: "Mundos con assets de verdad",
        body: "Las plantillas traen kits de modelos 3D y pixel art, así que los juegos se ven acabados desde la primera versión.",
      },
      {
        title: "Lo cambias hablando",
        body: "Cada cambio es un mensaje. Menciona un archivo con @ para decirle al agente exactamente qué tocar.",
      },
      {
        title: "Pagas lo que creas",
        body: "Un crédito equivale a un céntimo del coste real de generar un turno. Un turno que falla no cuesta nada.",
      },
    ],
  },
  pricing: {
    eyebrow: "Precios",
    title: "Paga por lo que creas",
    subtitle:
      "Todos los planes funcionan con créditos. Un crédito equivale a un céntimo del coste real de generar un turno.",
    perMonth: "/mes",
    popular: "El más elegido",
    plans: [
      {
        id: "free",
        name: "Gratis",
        price: "0 $",
        description: "Suficiente para descubrir si la idea que tienes en mente funciona.",
        features: [
          "100 créditos al mes",
          "Juegos y revisiones ilimitados",
          "Juega y comparte todos los juegos que crees",
        ],
        cta: "Empieza gratis",
      },
      {
        id: "pro",
        name: "Pro",
        price: "20 $",
        description: "Para esas semanas en las que una idea se convierte en nueve.",
        features: [
          "Todo lo incluido en Gratis",
          "2.000 créditos al mes",
          "Créditos extra para los meses de mayor uso",
        ],
        cta: "Elegir Pro",
      },
      {
        id: "max",
        name: "Max",
        price: "50 $",
        description: "Para equipos que crean a diario y no quieren estar pendientes del saldo.",
        features: [
          "Todo lo incluido en Pro",
          "5.500 créditos al mes",
          "Un 10 % más de créditos por dólar que Pro",
        ],
        cta: "Elegir Max",
      },
    ],
  },
  faq: {
    eyebrow: "Preguntas",
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Necesito saber programar?",
        a: "No. Tú describes el juego y el agente escribe el código. Todos los archivos quedan visibles en la app por si alguna vez quieres leerlos.",
      },
      {
        q: "¿Qué tipo de juegos puedo crear?",
        a: "Juegos 2D y 3D que corren en el navegador: plataformas, shooters, juegos de cartas, aventuras con vista cenital, conducción y más. Empieza desde una plantilla o desde un lienzo en blanco.",
      },
      {
        q: "¿Qué es un crédito?",
        a: "Un crédito equivale a un céntimo de dólar del coste de generar un turno. Una conversación larga sobre un juego complejo cuesta más que una breve sobre uno sencillo, por eso los créditos se gastan por turno y no por juego.",
      },
      {
        q: "¿Puedo empezar gratis?",
        a: "Sí. El plan Gratis incluye 100 créditos al mes, juegos y revisiones ilimitados, y puedes jugar y compartir todo lo que crees.",
      },
      {
        q: "¿Qué modelos de IA usa?",
        a: "Eliges entre tres niveles. Rápido es el más barato para ajustes pequeños, Equilibrado es la opción adecuada para la mayoría de juegos y Pro es más lento y potente para mecánicas que necesitan razonar de verdad.",
      },
      {
        q: "¿Puedo usar mis propias imágenes y archivos?",
        a: "Sí. Adjunta imágenes o archivos a tu mensaje y el agente los usa como referencia para el juego.",
      },
      {
        q: "¿Qué pasa si me quedo sin créditos?",
        a: "Los turnos nuevos se detienen hasta que tu saldo se recupere. No se elimina ni se bloquea nada. El plan Gratis se recarga el primer día de cada mes, y los planes Pro o Max pueden comprar créditos extra sin esperar.",
      },
      {
        q: "¿Puedo cancelar cuando quiera?",
        a: "Sí. Si cancelas Pro o Max, el plan sigue activo hasta el final del periodo que ya pagaste y después pasa a Gratis. Los créditos extra que hayas comprado se conservan.",
      },
    ],
  },
  finalCta: {
    title: ["Describe tu juego.", "numa lo construye."],
    subtitle: "Tus primeros 100 créditos van de nuestra parte, cada mes.",
  },
  footer: {
    tagline: "Crea videojuegos describiéndolos.",
    product: "Producto",
    language: "Idioma",
    rights: "Todos los derechos reservados.",
  },
  notFound: {
    title: "Este nivel no existe",
    body: "La página que buscas no está aquí. La isla sigue flotando donde la dejaste.",
    back: "Volver al inicio",
  },
}
