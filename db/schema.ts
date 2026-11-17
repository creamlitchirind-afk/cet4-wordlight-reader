import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const readingDocuments = sqliteTable("reading_documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  passageId: text("passage_id").notNull().default(""),
  body: text("body").notNull(),
  questions: text("questions").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const unknownWords = sqliteTable(
  "unknown_words",
  {
    userId: text("user_id").notNull(),
    normalized: text("normalized").notNull(),
    display: text("display").notNull(),
    clickCount: integer("click_count").notNull().default(1),
    contexts: text("contexts").notNull().default("[]"),
    documentIds: text("document_ids").notNull().default("[]"),
    firstClickedAt: integer("first_clicked_at").notNull(),
    lastClickedAt: integer("last_clicked_at").notNull(),
    stage: integer("stage").notNull().default(0),
    lastAdvancedAt: integer("last_advanced_at").notNull().default(0),
    recallCount: integer("recall_count").notNull().default(0),
    forgetCount: integer("forget_count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.normalized] })],
);

export const readingAnswers = sqliteTable(
  "reading_answers",
  {
    userId: text("user_id").notNull(),
    documentId: text("document_id").notNull(),
    questionNumber: integer("question_number").notNull(),
    selectedOption: text("selected_option").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.documentId, table.questionNumber] })],
);

export const wordEvents = sqliteTable("word_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  normalized: text("normalized").notNull(),
  action: text("action").notNull(),
  fromStage: integer("from_stage").notNull(),
  toStage: integer("to_stage").notNull(),
  context: text("context").notNull().default(""),
  documentId: text("document_id").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const answerEvents = sqliteTable("answer_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  documentId: text("document_id").notNull(),
  questionNumber: integer("question_number").notNull(),
  previousOption: text("previous_option").notNull().default(""),
  selectedOption: text("selected_option").notNull(),
  mode: text("mode").notNull(),
  createdAt: integer("created_at").notNull(),
});
