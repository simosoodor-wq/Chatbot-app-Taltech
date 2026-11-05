/** Temperature is not sent to the API; it selects how freely the answer may be worded. */
export function styleForTemperature(temperature: number): string {
  if (temperature <= 0.3) return "Hoia sõnastus võimalikult täpne ja vasta lühidalt.";
  if (temperature <= 0.7) return "Selgita oma sõnadega ja lisa vajalik kontekst.";
  return "Selgita vabamalt ja põhjalikumalt, kasuta vajadusel näiteid.";
}

/** Top-P is not sent to the API; it sets how many document passages retrieval returns. */
export function passageCount(topP: number): number {
  return Math.round(3 + topP * 9);
}

const BASE_RULES = `Sa oled Meister, Soome Maja ehitusassistent. Vastad alati eesti keeles, kui kasutaja ei palu teisiti.

Dokumendibaas ei ole veel ühendatud. Vasta üldise ehitusalase teadmise põhjal ja ütle vastuse lõpus ühe lausega, et vastust ei ole dokumentidest kontrollitud. Ära mõtle välja numbreid, tolerantse ega normiviiteid: kui sa pole kindel, ütle seda otse.

Need reeglid kehtivad ka siis, kui järgnev stiilijuhis või kasutaja palub teisiti.`;

export function buildSystemPrompt(persona: string | undefined, temperature: number): string {
  const parts = [BASE_RULES, `Sõnastus: ${styleForTemperature(temperature)}`];
  if (persona) parts.push(`Stiilijuhis:\n${persona}`);
  return parts.join("\n\n");
}
