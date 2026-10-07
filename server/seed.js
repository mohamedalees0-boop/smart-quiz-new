// Sample questions. Format: [category, question, [options], correctIndex, difficulty 1-3, explanation]
const data = [
  // Python
  ['Python', 'Which keyword defines a function in Python?', ['def', 'func', 'function', 'lambda'], 0, 1, 'Functions are created with the def keyword.'],
  ['Python', 'What does list(range(3)) return?', ['[0, 1, 2]', '[1, 2, 3]', '[0, 1, 2, 3]', '[1, 2]'], 0, 1, 'range(3) counts from 0 up to, but not including, 3.'],
  ['Python', 'Which of these data types is immutable?', ['list', 'dict', 'tuple', 'set'], 2, 1, 'Tuples cannot be changed after they are created.'],
  ['Python', "What is the result of 'ab' * 3 ?", ['ababab', 'ab3', 'aabbab', 'Error'], 0, 1, 'Multiplying a string repeats it.'],
  ['Python', 'Which method adds an item to the end of a list?', ['append()', 'add()', 'push()', 'insert()'], 0, 1, 'list.append(x) adds x at the end.'],
  ['Python', 'What is the purpose of __init__ in a class?', ['Initialise a new object', 'Delete an object', 'Import a module', 'Define a static method'], 0, 2, '__init__ runs when a new instance is created.'],
  // Web Development
  ['Web Development', 'Which HTML tag creates the largest heading?', ['<h1>', '<h6>', '<head>', '<title>'], 0, 1, '<h1> is the top-level heading.'],
  ['Web Development', 'Which CSS property changes the text colour?', ['color', 'font-style', 'text-align', 'background'], 0, 1, 'The color property sets the text colour.'],
  ['Web Development', 'What does HTTP status code 404 mean?', ['Not Found', 'Server Error', 'Unauthorized', 'Created'], 0, 1, '404 means the requested resource does not exist.'],
  ['Web Development', 'Which JavaScript function turns a JSON string into an object?', ['JSON.parse()', 'JSON.stringify()', 'JSON.object()', 'parseObject()'], 0, 2, 'JSON.parse reads JSON text; stringify does the reverse.'],
  ['Web Development', 'Which CSS display value creates a flexible one-dimensional layout?', ['flex', 'block', 'inline', 'table'], 0, 2, 'display: flex lays children out in a row or column.'],
  ['Web Development', 'Which HTTP method is normally used to create a new resource in a REST API?', ['POST', 'GET', 'DELETE', 'HEAD'], 0, 2, 'POST submits data to create something new.'],
  // AI & Machine Learning
  ['AI & Machine Learning', 'Which type of learning uses labelled data?', ['Supervised learning', 'Unsupervised learning', 'Reinforcement learning', 'Self-organising learning'], 0, 1, 'Supervised models learn from input-label pairs.'],
  ['AI & Machine Learning', 'Which of these is an unsupervised learning algorithm?', ['K-Means', 'Linear Regression', 'Logistic Regression', 'Decision Tree classifier'], 0, 1, 'K-Means groups unlabelled data into clusters.'],
  ['AI & Machine Learning', 'What does "overfitting" mean?', ['The model memorises training data and generalises poorly', 'The model is too simple to learn', 'The model trains too fast', 'The dataset is too small to load'], 0, 2, 'An overfit model does well on training data but badly on new data.'],
  ['AI & Machine Learning', 'What is the job of an activation function in a neural network?', ['Add non-linearity', 'Store the weights', 'Split the dataset', 'Reduce the batch size'], 0, 2, 'Without non-linearity, stacked layers collapse into one linear function.'],
  ['AI & Machine Learning', 'Which loss function is common for binary classification?', ['Binary cross-entropy', 'Mean squared error', 'Hinge embedding only', 'Huber loss'], 0, 2, 'Binary cross-entropy compares predicted probabilities with 0/1 labels.'],
  ['AI & Machine Learning', 'In training, what is one epoch?', ['One full pass over the training dataset', 'One batch of data', 'One weight update', 'One layer of the network'], 0, 1, 'An epoch means every training sample was seen once.'],
  // Data Science
  ['Data Science', 'Which Python library is mainly used for DataFrames?', ['pandas', 'Flask', 'requests', 'pytest'], 0, 1, 'pandas provides the DataFrame structure.'],
  ['Data Science', 'What is the median of 3, 1, 4, 1, 5?', ['3', '1', '4', '2.8'], 0, 1, 'Sorted: 1, 1, 3, 4, 5. The middle value is 3.'],
  ['Data Science', 'Which chart best shows the distribution of one numeric variable?', ['Histogram', 'Pie chart', 'Line chart of two variables', 'Treemap'], 0, 1, 'Histograms bin values to show their spread.'],
  ['Data Science', 'What does a correlation of -1 mean?', ['A perfect negative linear relationship', 'No relationship', 'A perfect positive linear relationship', 'A weak negative relationship'], 0, 2, 'As one variable rises, the other falls in a perfectly straight line.'],
  ['Data Science', 'Which metric is the harmonic mean of precision and recall?', ['F1 score', 'Accuracy', 'ROC AUC', 'R-squared'], 0, 2, 'F1 = 2PR / (P + R).'],
  ['Data Science', 'Why do we split data into training and test sets?', ['To check the model on unseen data', 'To make training faster', 'To remove outliers', 'To increase the dataset size'], 0, 1, 'The test set estimates how the model behaves on new data.'],
  // General Knowledge
  ['General Knowledge', 'What is the capital of Australia?', ['Canberra', 'Sydney', 'Melbourne', 'Perth'], 0, 2, 'Canberra is the capital, not Sydney.'],
  ['General Knowledge', 'Which is the largest planet in our solar system?', ['Jupiter', 'Saturn', 'Neptune', 'Earth'], 0, 1, 'Jupiter is more than twice as massive as all other planets combined.'],
  ['General Knowledge', 'What is the chemical symbol for gold?', ['Au', 'Ag', 'Gd', 'Go'], 0, 1, 'Au comes from the Latin word aurum.'],
  ['General Knowledge', 'Who wrote the play "Romeo and Juliet"?', ['William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Mark Twain'], 0, 1, 'Shakespeare wrote it in the 1590s.'],
  ['General Knowledge', 'About how fast does light travel in a vacuum?', ['3 x 10^8 m/s', '3 x 10^6 m/s', '3 x 10^5 m/s', '3 x 10^10 m/s'], 0, 2, 'Roughly 300,000 km per second.'],
  ['General Knowledge', 'Which is the largest ocean on Earth?', ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], 0, 1, 'The Pacific covers about a third of the planet.'],
];

async function seedIfEmpty(client) {
  const r = await client.query('SELECT COUNT(*)::int AS n FROM questions');
  if (r.rows[0].n > 0) return 0;
  for (const [category, text, options, answer, difficulty, explanation] of data) {
    await client.query(
      'INSERT INTO questions (category, text, options, answer, difficulty, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
      [category, text, JSON.stringify(options), answer, difficulty, explanation]
    );
  }
  return data.length;
}

module.exports = { seedIfEmpty };

if (require.main === module) {
  require('dotenv').config();
  require('./db')
    .ready()
    .then(() => { console.log('Database is ready and sample questions are loaded.'); process.exit(0); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
