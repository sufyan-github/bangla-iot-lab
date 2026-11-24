# Kit lessons: content

The lesson files in this folder (`*.json`: their text in Bangla and English,
and the steps and checks) are written for Bangla IoT Lab and are licensed under
the **Creative Commons Attribution 4.0 International licence (CC BY 4.0)**. The
licence text is in [`LICENSES/CC-BY-4.0.txt`](../../../LICENSES/CC-BY-4.0.txt).

You may copy, translate, adapt and share them, including commercially, as long
as you give credit, for example: "From the kit lessons of Bangla IoT Lab
(https://github.com/sufyan-github/bangla-iot-lab), CC BY 4.0." and say if you
changed them.

The glossary in `glossary/terms.json` (its terms and their meanings in both
languages) is written for Bangla IoT Lab too, and is under the same CC BY 4.0
licence.

The rest of the lessons package (its code in `../src`) and the ESP32 programs
the lessons use (`packages/board-emulators/fixtures/esp32-starters`) are
Apache-2.0, like the rest of the project's code.

The lessons follow the parts of the school kit, but contain no text, pictures
or programs from any handbook or book about that kit.

## Writing a lesson

Each file is one lesson; the format is `../src/schema.ts`. A step's checks look
at the student's circuit, its program and what the simulation showed, so any
correct circuit passes. Every lesson has a walkthrough in
`../src/lessons.test.ts` that completes it against the real simulation; a
lesson that asks for something the lab cannot show fails that test.

## Adding a glossary term

A term in `glossary/terms.json` uses the word the lab itself uses, in each
language; `../src/glossary.test.ts` fails if the word does not appear in the
lessons or on the lab's screens. Other names in use, such as a textbook's
word, go under `also`. A bold word in a lesson that names a term is shown as
one, with its name in the other language and its meaning a tap away.
