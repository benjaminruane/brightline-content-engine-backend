// helpers/promptRecipes.js

export const PROMPT_RECIPES = {
  generic: {
    systemPrompt:
      "You are an experienced investment writer who produces clear, neutral, institutional-grade text.",
    templates: {
      press_release:
        "Write an investment-focused press release based on the following information.\\n\\nTitle: {{title}}\\n\\nNotes: {{notes}}\\n\\nSource text:\\n{{text}}\\n\\nScenario: {{scenario}}",
      transaction_text:
        "Write an internal transaction commentary based on the following information.\\n\\nNotes: {{notes}}\\n\\nSource text:\\n{{text}}\\n\\nScenario: {{scenario}}"
    }
  }
};
