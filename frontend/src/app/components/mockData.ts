import type { Paper, User } from './types';

export const MOCK_USERS: User[] = [
  {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@paperread.io',
    role: 'admin',
    password: 'admin123',
  },
  {
    id: 'user-1',
    name: 'Alice Chen',
    email: 'alice@example.com',
    role: 'user',
    password: 'password123',
  },
  {
    id: 'user-2',
    name: 'Bob Wang',
    email: 'bob@example.com',
    role: 'user',
    password: 'password123',
  },
];

const ATTENTION_PAPER_HTML = `
<article class="paper-content">
  <h1>Attention Is All You Need</h1>
  <div class="authors">Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin</div>
  <div class="venue">Advances in Neural Information Processing Systems 30, 2017</div>

  <section>
    <h2>Abstract</h2>
    <p>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.</p>
  </section>

  <section>
    <h2>1. Introduction</h2>
    <p>Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular, have been firmly established as state of the art approaches in sequence modeling and transduction problems such as language modeling and machine translation. Numerous efforts have since continued to push the boundaries of recurrent language models and encoder-decoder architectures.</p>
    <p>Recurrent models typically factor computation along the symbol positions of the input and output sequences. Aligning the positions to steps in computation time, they generate a sequence of hidden states <em>h<sub>t</sub></em>, as a function of the previous hidden state <em>h<sub>t−1</sub></em> and the input for position <em>t</em>. This inherently sequential nature precludes parallelization within training examples, which becomes critical at longer sequence lengths, as memory constraints limit batching across examples.</p>
    <p>Attention mechanisms have become an integral part of compelling sequence modeling and transduction models in various tasks, allowing modeling of dependencies without regard to their distance in the input or output sequences. In all but a few cases, however, such attention mechanisms are used in conjunction with a recurrent network.</p>
    <p>In this work we propose the Transformer, a model architecture eschewing recurrence and instead relying entirely on an attention mechanism to draw global dependencies between input and output. The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality after being trained for as little as twelve hours on eight P100 GPUs.</p>
  </section>

  <section>
    <h2>2. Background</h2>
    <p>The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU, ByteNet and ConvS2S, all of which use convolutional neural networks as basic building block, computing hidden representations in parallel for all input and output positions. In these models, the number of operations required to relate signals from two arbitrary input or output positions grows in the distance between positions, linearly for ConvS2S and logarithmically for ByteNet.</p>
    <p>This makes it more difficult to learn dependencies between distant positions. In the Transformer this is reduced to a constant number of operations, albeit at the cost of reduced effective resolution due to averaging attention-weighted positions, an effect we counteract with Multi-Head Attention as described in section 3.2.</p>
    <p>Self-attention, sometimes called intra-attention is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence. Self-attention has been used successfully in a variety of tasks including reading comprehension, abstractive summarization, textual entailment and learning task-independent sentence representations.</p>
  </section>

  <section>
    <h2>3. Model Architecture</h2>
    <p>Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations <em>(x<sub>1</sub>, ..., x<sub>n</sub>)</em> to a sequence of continuous representations <em>z = (z<sub>1</sub>, ..., z<sub>n</sub>)</em>. Given <em>z</em>, the decoder then generates an output sequence <em>(y<sub>1</sub>, ..., y<sub>m</sub>)</em> of symbols one element at a time. At each step the model is auto-regressive, consuming the previously generated symbols as additional input when generating the next.</p>

    <h3>3.1 Encoder and Decoder Stacks</h3>
    <p><strong>Encoder:</strong> The encoder is composed of a stack of N = 6 identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, positionwise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization. That is, the output of each sub-layer is LayerNorm(x + Sublayer(x)), where Sublayer(x) is the function implemented by the sub-layer itself. To facilitate these residual connections, all sub-layers in the model, as well as the embedding layers, produce outputs of dimension <em>d<sub>model</sub></em> = 512.</p>
    <p><strong>Decoder:</strong> The decoder is also composed of a stack of N = 6 identical layers. In addition to the two sub-layers in each encoder layer, the decoder inserts a third sub-layer, which performs multi-head attention over the output of the encoder stack. Similar to the encoder, we employ residual connections around each of the sub-layers, followed by layer normalization. We also modify the self-attention sub-layer in the decoder stack to prevent positions from attending to subsequent positions.</p>

    <h3>3.2 Attention</h3>
    <p>An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.</p>
    <p>We call our particular attention "Scaled Dot-Product Attention". The input consists of queries and keys of dimension <em>d<sub>k</sub></em>, and values of dimension <em>d<sub>v</sub></em>. We compute the dot products of the query with all keys, divide each by <em>√d<sub>k</sub></em>, and apply a softmax function to obtain the weights on the values.</p>
  </section>

  <section>
    <h2>4. Why Self-Attention</h2>
    <p>In this section we compare various aspects of self-attention layers to the recurrent and convolutional layers commonly used for mapping one variable-length sequence of symbol representations to another sequence of equal length. We consider three desiderata.</p>
    <p>One is the total computational complexity per layer. Another is the amount of computation that can be parallelized, as measured by the minimum number of sequential operations required. The third is the path length between long-range dependencies in the network. Learning long-range dependencies is a key challenge in many sequence transduction tasks.</p>
  </section>

  <section>
    <h2>5. Training</h2>
    <p>We trained our models on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs. Sentences were encoded using byte-pair encoding, which has a shared source-target vocabulary of about 37000 tokens. For English-French, we used the significantly larger WMT 2014 English-French dataset consisting of 36M sentences and split tokens into a 32000 word-piece vocabulary.</p>
    <p>We trained on one machine with 8 NVIDIA P100 GPUs. For our base models using the hyperparameters described throughout the paper, each training step took about 0.4 seconds. We trained the base models for a total of 100,000 steps or 12 hours. For our big models, step time was 1.0 seconds. The big models were trained for 300,000 steps (3.5 days).</p>
  </section>

  <section>
    <h2>6. Results</h2>
    <p>On the WMT 2014 English-to-German translation task, the big transformer model outperforms the best previously reported models including ensembles by more than 2.0 BLEU, establishing a new state-of-the-art BLEU score of 28.4. The configuration of this model is listed in the bottom line of Table 3. Training took 3.5 days on 8 P100 GPUs. Even our base model surpasses all previously published models and ensembles, at a fraction of the training cost of any of the competitive models.</p>
    <p>On the WMT 2014 English-to-French translation task, our big model achieves a BLEU score of 41.0, outperforming all of the previously published single models, at less than 1/4 the training cost of the previous state-of-the-art model.</p>
  </section>

  <section>
    <h2>7. Conclusion</h2>
    <p>In this work, we presented the Transformer, the first sequence transduction model based entirely on attention, replacing the recurrent layers most commonly used in encoder-decoder architectures with multi-headed self-attention.</p>
    <p>For translation tasks, the Transformer can be trained significantly faster than architectures based on recurrent or convolutional layers. We achieved new state of the art on both WMT 2014 English-to-German and WMT 2014 English-to-French translation tasks. In the former task our best model outperforms even all previously reported ensembles.</p>
    <p>We are excited about the future of attention-based models and plan to apply them to other tasks. We plan to extend the Transformer to problems involving input and output modalities other than text and to investigate local, restricted attention mechanisms to efficiently handle large inputs and outputs such as images, audio and video.</p>
  </section>
</article>
`;

const BERT_PAPER_HTML = `
<article class="paper-content">
  <h1>BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding</h1>
  <div class="authors">Jacob Devlin, Ming-Wei Chang, Kenton Lee, Kristina Toutanova</div>
  <div class="venue">NAACL 2019</div>

  <section>
    <h2>Abstract</h2>
    <p>We introduce a new language representation model called BERT, which stands for Bidirectional Encoder Representations from Transformers. Unlike recent language representation models, BERT is designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers. As a result, the pre-trained BERT model can be fine-tuned with just one additional output layer to create state-of-the-art models for a wide range of tasks, such as question answering and language inference, without substantial task-specific architecture modifications.</p>
    <p>BERT is conceptually simple and empirically powerful. It obtains new state-of-the-art results on eleven natural language processing tasks, including pushing the GLUE score to 80.5% (7.7% point absolute improvement), MultiNLI accuracy to 86.7% (4.6% absolute improvement), SQuAD v1.1 question answering Test F1 to 93.2 (1.5 point absolute improvement) and SQuAD v2.0 Test F1 to 83.1 (5.1 point absolute improvement).</p>
  </section>

  <section>
    <h2>1. Introduction</h2>
    <p>Language model pre-training has been shown to be effective for improving many natural language processing tasks. These include sentence-level tasks such as natural language inference and paraphrasing, which aim to predict the relationships between sentences by analyzing them holistically, as well as token-level tasks such as named entity recognition and question answering, where models are required to produce fine-grained output at the token level.</p>
    <p>There are two existing strategies for applying pre-trained language representations to downstream tasks: <em>feature-based</em> and <em>fine-tuning</em>. The feature-based approach, such as ELMo, uses task-specific architectures that include the pre-trained representations as additional features. The fine-tuning approach, such as the Generative Pre-trained Transformer (OpenAI GPT), introduces minimal task-specific parameters, and is trained on the downstream tasks by simply fine-tuning all pretrained parameters.</p>
    <p>The two approaches share the same objective function during pre-training, where they use unidirectional language models to learn general language representations. We argue that current techniques severely restrict the power of the pre-trained representations, especially for the fine-tuning approaches.</p>
  </section>

  <section>
    <h2>2. BERT</h2>
    <p>We introduce BERT and its detailed implementation in this section. There are two steps in our framework: <em>pre-training</em> and <em>fine-tuning</em>. During pre-training, the model is trained on unlabeled data over different pre-training tasks. For fine-tuning, the BERT model is first initialized with the pre-trained parameters, and all of the parameters are fine-tuned using labeled data from the downstream tasks. Each downstream task has separate fine-tuned models, even though they are initialized with the same pre-trained parameters.</p>

    <h3>2.1 Model Architecture</h3>
    <p>BERT's model architecture is a multi-layer bidirectional Transformer encoder based on the original implementation described in Vaswani et al. (2017) and released in the tensor2tensor library. Because the use of Transformers has become common and our implementation is almost identical to the original, we will omit an exhaustive background description of the model architecture and refer readers to Vaswani et al. (2017) as well as excellent guides such as "The Annotated Transformer".</p>
    <p>In this work, we denote the number of layers (i.e., Transformer blocks) as L, the hidden size as H, and the number of self-attention heads as A. We primarily report results on two model sizes: <strong>BERT<sub>BASE</sub></strong> (L=12, H=768, A=12, Total Parameters=110M) and <strong>BERT<sub>LARGE</sub></strong> (L=24, H=1024, A=16, Total Parameters=340M).</p>

    <h3>2.2 Input/Output Representations</h3>
    <p>To make BERT handle a variety of down-stream tasks, our input representation is able to unambiguously represent both a single sentence and a pair of sentences in one token sequence. Throughout this work, a "sentence" can be an arbitrary span of contiguous text, rather than an actual linguistic sentence. A "sequence" refers to the input token sequence to BERT, which may be a single sentence or two sentences packed together.</p>
  </section>

  <section>
    <h2>3. Experiments</h2>
    <p>In this section, we present BERT fine-tuning results on 11 NLP tasks. We primarily follow the GLUE benchmark experiment settings.</p>

    <h3>3.1 GLUE</h3>
    <p>The General Language Understanding Evaluation (GLUE) benchmark is a collection of diverse natural language understanding tasks. Detailed descriptions of GLUE datasets are included in Appendix B. To fine-tune on GLUE, we represent the input sequence as described in Section 3, and use the final hidden vector C ∈ R<sup>H</sup> corresponding to the first input token ([CLS]) as the aggregate representation.</p>

    <h3>3.2 SQuAD v1.1</h3>
    <p>The Stanford Question Answering Dataset (SQuAD v1.1) is a collection of 100k crowd-sourced question/answer pairs. Given a question and a passage from Wikipedia containing the answer, the task is to predict the answer text span in the passage. BERT fine-tuning on SQuAD is straightforward. We represent the input question and passage as a single packed sequence, with the question using the A embedding and the passage using the B embedding.</p>
  </section>

  <section>
    <h2>4. Conclusion</h2>
    <p>Recent empirical improvements due to transfer learning with language models have demonstrated that rich, unsupervised pre-training is an integral part of many language understanding systems. In particular, these results enable even low-resource tasks to benefit from deep unidirectional architectures. Our major contribution is further generalizing these findings to deep bidirectional architectures, allowing the same pre-trained model to successfully tackle a broad set of NLP tasks.</p>
  </section>
</article>
`;

const GPT_PAPER_HTML = `
<article class="paper-content">
  <h1>Language Models are Few-Shot Learners</h1>
  <div class="authors">Tom Brown, Benjamin Mann, Nick Ryder, Melanie Subbiah, Jared Kaplan, et al.</div>
  <div class="venue">NeurIPS 2020</div>

  <section>
    <h2>Abstract</h2>
    <p>Recent work has demonstrated substantial gains on many NLP tasks and benchmarks by pre-training on a large corpus of text followed by fine-tuning on a specific task. While typically task-agnostic in architecture, this method still requires task-specific fine-tuning datasets of thousands or tens of thousands of examples. By contrast, humans can generally perform a new language task from only a few examples or from simple instructions – something which current NLP systems still largely struggle to do. Here we show that scaling up language models greatly improves task-agnostic, few-shot performance, sometimes even reaching competitiveness with prior state-of-the-art fine-tuning approaches.</p>
    <p>Specifically, we train GPT-3, an autoregressive language model with 175 billion parameters, 10x more than any previous non-sparse language model, and test its performance in the few-shot setting. For all tasks, GPT-3 is applied without any gradient updates or fine-tuning, with tasks and few-shot demonstrations specified purely via text interaction with the model.</p>
  </section>

  <section>
    <h2>1. Introduction</h2>
    <p>NLP has recently made striking progress due to pre-training on large corpora of text. A small number of task-agnostic models have achieved strong results across a range of tasks in NLP, the most prominent of which is the "pre-train, fine-tune" paradigm. In this paradigm, task-specific heads are learned on top of a general pre-trained model, typically using labeled data from thousands or more examples.</p>
    <p>While this approach has proven powerful, it still has limitations. First, from a practical perspective, the need for a large dataset of labeled examples for every new task limits the applicability of language models. Second, the potential to exploit spurious correlations in training data fundamentally grows with the expressiveness of the model and the narrowness of the training distribution.</p>
  </section>

  <section>
    <h2>2. Approach</h2>
    <p>Our basic pre-training approach, including model, data, and training, follows the approach described in previous work with relatively straightforward scaling up. Our approach for in-context learning is the same as previous work, but we systematically study few-shot, one-shot, and zero-shot settings and how they compare with standard fine-tuning.</p>

    <h3>2.1 Model and Architectures</h3>
    <p>We use the same model and architecture as GPT-2, including the modified initialization, pre-normalization, and reversible tokenization described therein, with the exception that we use alternating dense and locally banded sparse attention patterns in the layers of the transformer, similar to the Sparse Transformer. To study the dependence of ML performance on model size, we train 8 different sizes of model, ranging over three orders of magnitude from 125 million parameters to 175 billion parameters.</p>

    <h3>2.2 Training Dataset</h3>
    <p>Datasets for language models have rapidly expanded, culminating in the Common Crawl dataset constituting nearly a trillion words. This size of dataset is sufficient to train our largest models without ever updating on the same sequence twice. However, we have found that unfiltered or lightly filtered versions of Common Crawl tend to have lower quality than more curated datasets. Therefore, we took 3 steps to improve the average quality of our datasets.</p>
  </section>

  <section>
    <h2>3. Results</h2>
    <p>In the following sections we report results on a wide range of datasets and compare with relevant prior work. We organize results by task type. An important caveat is that our test results with GPT-3 should be understood as measuring the meta-learning capabilities of GPT-3 rather than comparing directly with state-of-the-art fine-tuned models trained specifically on these tasks.</p>
  </section>
</article>
`;

export const MOCK_PAPERS: Paper[] = [
  {
    id: 'paper-1',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit'],
    abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture based solely on attention mechanisms.',
    source: 'arxiv',
    arxivId: '1706.03762',
    htmlContent: ATTENTION_PAPER_HTML,
    uploadedBy: 'admin-1',
    uploadedAt: '2024-01-10T08:00:00Z',
    status: 'published',
    tags: ['NLP', 'Transformer', 'Attention'],
  },
  {
    id: 'paper-2',
    title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
    authors: ['Jacob Devlin', 'Ming-Wei Chang', 'Kenton Lee', 'Kristina Toutanova'],
    abstract: 'We introduce BERT, designed to pre-train deep bidirectional representations from unlabeled text by jointly conditioning on both left and right context in all layers.',
    source: 'arxiv',
    arxivId: '1810.04805',
    htmlContent: BERT_PAPER_HTML,
    uploadedBy: 'admin-1',
    uploadedAt: '2024-01-12T10:00:00Z',
    status: 'published',
    tags: ['NLP', 'BERT', 'Pre-training'],
  },
  {
    id: 'paper-3',
    title: 'Language Models are Few-Shot Learners',
    authors: ['Tom Brown', 'Benjamin Mann', 'Nick Ryder', 'Melanie Subbiah'],
    abstract: 'We train GPT-3, an autoregressive language model with 175 billion parameters, and test its performance in the few-shot setting across many NLP tasks.',
    source: 'pdf',
    htmlContent: GPT_PAPER_HTML,
    uploadedBy: 'user-1',
    uploadedAt: '2024-01-15T14:00:00Z',
    status: 'published',
    tags: ['NLP', 'GPT-3', 'Few-shot'],
  },
];
