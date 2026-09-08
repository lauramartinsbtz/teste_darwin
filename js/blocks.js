const INVENTOR_PORTS = [
  ["D0", "D0"],
  ["D1", "D1"],
  ["D2", "D2"],
  ["D3", "D3"]
];

Blockly.Blocks["inicio"] = {
  init: function() {
    this.appendDummyInput()
      .appendField("Início");
    this.appendStatementInput("DO")
      .appendField("executar em loop");
    this.setColour("#FFAB19");
    this.setTooltip("Ponto inicial do programa. Os blocos internos são repetidos continuamente.");
    this.setDeletable(true);
  }
};

function criarBlocoSaida(tipo, nome, cor) {
  Blockly.Blocks[tipo] = {
    init: function() {
      this.appendDummyInput()
        .appendField(nome)
        .appendField(new Blockly.FieldDropdown(INVENTOR_PORTS), "PORT");

      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(cor);
    }
  };
}

criarBlocoSaida("ligar_led", "LigarLed", "#4C97FF");
criarBlocoSaida("desligar_led", "DesligarLed", "#4C97FF");
criarBlocoSaida("ligar_sirene", "LigarSirene", "#CF63CF");
criarBlocoSaida("desligar_sirene", "DesligarSirene", "#CF63CF");

Blockly.Blocks["esperar_ms"] = {
  init: function() {
    this.appendValueInput("TIME")
      .setCheck("Number")
      .appendField("Esperar");

    this.appendDummyInput()
      .appendField("ms");

    this.setInputsInline(true);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour("#5CA65C");
    this.setTooltip("Pausa a execução pelo tempo informado.");
  }
};


// Entrada digital: retorna verdadeiro quando o botão da porta selecionada está acionado.
Blockly.Blocks["ler_botao"] = {
  init: function() {
    this.appendDummyInput()
      .appendField("LerBotao")
      .appendField(new Blockly.FieldDropdown(INVENTOR_PORTS), "PORT");
    this.setOutput(true, "Boolean");
    this.setColour("#5CB1D6");
    this.setTooltip("Lê o estado de um botão conectado a D0, D1, D2 ou D3.");
  }
};

// Estrutura condicional simplificada para uso educacional.
Blockly.Blocks["se_entao"] = {
  init: function() {
    this.appendValueInput("COND")
      .setCheck("Boolean")
      .appendField("SE");
    this.appendStatementInput("DO")
      .appendField("Então");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour("#FFAB19");
    this.setTooltip("Executa os blocos internos quando a condição for verdadeira.");
  }
};
