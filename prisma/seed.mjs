import { PrismaClient } from "@prisma/client";

const prompts = [
  {
    name: "Ehitusnõustaja",
    content:
      "Anna selge ja praktiline vastus. Alusta otsesest järeldusest, seejärel too välja tööetapid või olulised tingimused.",
  },
  {
    name: "Tehniline kontroll",
    content:
      "Keskendu numbritele, tolerantsidele, normidele ja tabelitele. Too väärtused täpselt koos ühikute ja tingimustega.",
  },
  {
    name: "Lihtne selgitus",
    content:
      "Selgita nii, et ehitusala mittetundev klient saab aru. Väldi erialažargooni ja selgita vajalikud mõisted lahti.",
  },
];

const prisma = new PrismaClient();

try {
  // Only an empty table is seeded, so prompts a user deleted do not return on each deploy.
  if ((await prisma.systemPrompt.count()) === 0) {
    await prisma.systemPrompt.createMany({ data: prompts });
    console.log(`Seeded ${prompts.length} system prompts.`);
  }
} finally {
  await prisma.$disconnect();
}
