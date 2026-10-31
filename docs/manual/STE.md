# Writing rules for the Stratum 4D manual (ASD-STE100)

The manual is written in Simplified Technical English (ASD-STE100, Issue 9). These are the rules we apply. `scripts/manual/build.cjs` checks the ones a script can check and lists every breach when it builds.

## Words

- Use approved words with their approved meaning only. Examples of words we do not use, and what we use instead:

| Do not use | Use |
|---|---|
| utilize, employ | use |
| ensure, verify | make sure |
| require, need (verb) | it is necessary to … / must |
| commence, initiate | start |
| terminate | stop |
| perform, execute | do |
| adjacent | next to |
| approximately | about |
| additional | more |
| assist | help |
| subsequent, following (adjective) | next / after |
| prior to | before |
| in order to | to |
| via | with, through |
| should (instruction) | must, or an imperative |
| may, might (possibility) | can |
| please | (leave out) |

- Technical names (product names, field names, menu names, file types) and technical verbs that describe software actions (click, double-click, type, drag, select, import, export, save) are permitted.
- One word has one meaning. A "project" is always a schedule saved in Stratum; a "file" is always a file on the disk.

## Sentences

- Procedural sentences (instructions): 20 words or fewer.
- Descriptive sentences: 25 words or fewer.
- One instruction in each sentence. Two actions in one sentence only if they occur at the same time.
- Write instructions in the imperative ("Click Save."). Put a condition first ("If the file is large, wait.").
- Use the active voice in procedures. Use the passive voice in descriptions only when the actor is not known or not important.
- Use the simple tenses only (present, past, future).
- Do not use "-ing" words, except in technical names (for example "Tracking Gantt").
- Keep the articles (the, a) and the words "that" and "which". Do not write in telegraphic style.
- Noun clusters: three words or fewer. Use "of", "for" or "in" to break longer clusters.

## Paragraphs and procedures

- A descriptive paragraph has one topic and six sentences or fewer.
- A procedure is a numbered list. Each step has one action (or two actions that occur at the same time).
- A step can have a result line ("Result: …") under it.
- Warnings and cautions go before the step that they apply to:
  - **WARNING** – a risk of injury (not used in this software manual).
  - **CAUTION** – a risk of data loss or damage.
  - **NOTE** – information that helps the user.

## Layout of each chapter

1. Purpose of the chapter (one or two sentences).
2. Description, with one infographic or screenshot for each main subject.
3. Procedures.
4. Related chapters.
