# Random Forest scope check (Google Colab)

These notebooks train the Random Forest that decides whether a message is about Kenya Airways policy (`in_scope`) or not (`off_topic`). The app runs the exported forest in `lib/rag/forest.ts`.

They run in Google Colab from a Google Drive folder named `My Drive/kq-scope-forest`. Copy the five files there and open the notebooks with Colab.

| File | What it does |
|---|---|
| `1_download_data.ipynb` | Downloads the public datasets and the test set, and saves `data/public.csv` and `data/test.csv`. Run once |
| `2_train_and_test.ipynb` | Embeds the examples, trains the forest and reports the test results. Saves `models/forest.joblib` |
| `3_export_for_app.ipynb` | Exports the forest to `models/scope-forest.json` for Cloudflare KV, with 5 check questions and their probabilities |
| `common.py` | Folder paths and the embedding function (BAAI/bge-small-en-v1.5, CLS pooling, normalised). Embeddings are cached on Drive |
| `own_examples.py` | The project's own labelled examples |

The datasets, the embedding cache and the trained model stay on Drive. They aren't committed: they are large, and they are produced by these notebooks.

## Data and split

- **Test set:** `eval/questions.jsonl` from this repository, minus the 30 staff-leakage rows. It has 149 `in_scope` (answerable, uncovered, follow-up and agent questions) and 37 `off_topic` (off-topic and prompt injection) messages. It is never used for training.
- **Training set:** public datasets from Hugging Face (Bitext travel chatbot instructions, CLINC150 flight and out-of-scope intents, deepset prompt injections, Twitter US Airline Sentiment) plus 88 of the project's own examples (45 in scope, 43 off topic), giving 895 `in_scope` and 514 `off_topic` messages.
- **Seeds:** `random_state=42` for sampling and for the forest.

## Model

`RandomForestClassifier` with 300 trees, no depth limit, `min_samples_leaf=2` and `class_weight="balanced"`, trained on 384-number bge-small embeddings. The exported JSON is 1.2 MB, or 0.28 MB compressed.

## Results (test set, 5 November 2026)

| Run | Features | Accuracy |
|---|---|---|
| Baseline | TF-IDF, public data only | 24% |
| 2 | bge-small embeddings, public data | 62% |
| 3 | + airline tweets, 300 trees | 81% |
| Final | + the project's own examples | **83.9%** |

Confusion matrix of the final run (rows are the true class, columns the predicted class):

| | predicted in_scope | predicted off_topic |
|---|---|---|
| **in_scope** (149) | 124 | 25 |
| **off_topic** (37) | 5 | 32 |

In the app, the forest decides alone only when it is confident: above 0.7 it refuses, below 0.3 it answers, and in between the AI model's scope check decides. On the test set the forest was confident on 69 of 186 messages (37%), with no mistakes among them.

## Check that the app matches Colab

On 12 November 2026 the deployed app gave `p = 0.303` and `0.567` for two of the export's check questions, against `0.301` and `0.567` in Colab (`npx wrangler tail`).
