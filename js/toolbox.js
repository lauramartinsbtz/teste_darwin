const INVENTOR_TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Controle",
      colour: "#FFAB19",
      contents: [
        { kind: "block", type: "inicio" },
        { kind: "block", type: "se_entao" },
        {
          kind: "block",
          type: "esperar_ms",
          inputs: {
            TIME: {
              shadow: {
                type: "math_number",
                fields: { NUM: 1000 }
              }
            }
          }
        }
      ]
    },
    {
      kind: "category",
      name: "Entrada",
      colour: "#5CB1D6",
      contents: [
        { kind: "block", type: "ler_botao" }
      ]
    },
    {
      kind: "category",
      name: "LED",
      colour: "#4C97FF",
      contents: [
        { kind: "block", type: "ligar_led" },
        { kind: "block", type: "desligar_led" }
      ]
    },
    {
      kind: "category",
      name: "Sirene",
      colour: "#CF63CF",
      contents: [
        { kind: "block", type: "ligar_sirene" },
        { kind: "block", type: "desligar_sirene" }
      ]
    }
  ]
};
