// Demo data: one account pre-filled with the sample content from the original design,
// so a fresh install looks alive. Runs only when the users table is empty.
//   Email:    demo@university.edu
//   Password: demo1234
import bcrypt from 'bcryptjs'
import { db, one, run, transaction } from './index.js'

const DAY = 86_400_000
const iso = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const dateOnly = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n, hour = 10) => { const d = new Date(Date.now() - n * DAY); d.setUTCHours(hour, 0, 0, 0); return d }
const daysAhead = (n) => new Date(Date.now() + n * DAY)

// Deterministic pseudo-random so the demo looks the same on every install.
let s = 42
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)

const DOM_REVIEWER = `## Module overview
The Document Object Model is a browser-provided programming interface that represents an HTML page as a structured tree. JavaScript can use this tree to read content, update styles, create elements, and respond to user interactions.

> **Core idea:** The DOM connects JavaScript to the visible web page. Changing a DOM node updates what the user sees without requiring a full page reload.

## Working with the DOM
1. **Select** — Find elements using querySelector or related methods.
2. **Read** — Access text, attributes, classes, and computed values.
3. **Update** — Modify content, styles, attributes, or element structure.
4. **Listen** — Respond to clicks, keyboard input, and other browser events.

## Key terms
- **Node:** Any object in the DOM tree, including elements, text, and comments.
- **Event:** A signal that an interaction or browser action has occurred.
- **Event listener:** A function registered to respond when an event occurs.
- **Event bubbling:** An event starts at the target element and propagates upward through its ancestors.

## Quick summary
Use \`querySelector()\` for the first match and \`querySelectorAll()\` for every match. Attach behaviour with \`addEventListener()\`, and remember that most events bubble — which makes event delegation possible.`

const SUBJECTS = [
  {
    name: 'Web Development', code: 'IT 214', icon: 'WEB', color: '#DCFCE7', semester: 'Spring 2025',
    description: 'Front-end fundamentals: HTML, CSS, JavaScript and browser APIs.',
    modules: [
      { title: 'HTML & Semantic Structure', file: 'IT214_Module_01.pdf', type: 'PDF', pages: 28, ago: 30,
        cards: [['What is semantic HTML?', 'Using elements that describe their meaning (header, nav, article, footer) instead of generic divs.'],
                ['Why use <main>?', 'It marks the dominant content of the page, helping screen readers and search engines.']],
        questions: [
          ['Which element represents self-contained content such as a blog post?', ['<section>', '<article>', '<aside>', '<div>'], 1, 'An <article> is a self-contained composition that could be distributed on its own.', 'HTML Semantics'],
          ['Which attribute provides alternative text for images?', ['title', 'alt', 'src', 'aria-hidden'], 1, 'The alt attribute describes the image for assistive technology and when it fails to load.', 'HTML Semantics'],
        ] },
      { title: 'JavaScript & the DOM', file: 'Week_04_JavaScript_DOM.pptx', type: 'PPTX', pages: 42, ago: 2, reviewer: DOM_REVIEWER,
        cards: [['What is the Document Object Model?', 'A programming interface that represents an HTML document as a tree of objects that JavaScript can read and modify.'],
                ['What does addEventListener() do?', 'It attaches a handler function that runs when a specified event occurs on an element.'],
                ['Define event bubbling.', 'The process where an event begins at the target element and propagates upward through its ancestor elements.'],
                ['querySelector vs querySelectorAll?', 'querySelector returns the first matching element; querySelectorAll returns a static NodeList of all matches.']],
        questions: [
          ['Which JavaScript method selects the first element that matches a specified CSS selector?', ['getElementById()', 'querySelector()', 'querySelectorAll()', 'getElementsByClassName()'], 1, 'querySelector() returns the first element in the document that matches the selector. Use querySelectorAll() for every match.', 'DOM Selection'],
          ['Which DOM event fires after the browser has parsed the HTML document, without waiting for images to finish loading?', ['load', 'DOMContentLoaded', 'beforeunload', 'readystatechange'], 1, 'DOMContentLoaded fires as soon as the HTML has been fully parsed and the DOM tree is ready.', 'DOM Events'],
          ['What does event.stopPropagation() do?', ['Cancels the default browser action', 'Stops the event from bubbling to ancestors', 'Removes the event listener', 'Pauses JavaScript execution'], 1, 'stopPropagation() prevents further propagation of the event in the capturing and bubbling phases.', 'DOM Events'],
          ['Which property safely sets plain text inside an element?', ['innerHTML', 'outerHTML', 'textContent', 'value'], 2, 'textContent sets text without parsing HTML, avoiding injection issues.', 'DOM Selection'],
          ['Event delegation relies on which behaviour?', ['Event capturing only', 'Event bubbling', 'Synchronous rendering', 'Hoisting'], 1, 'Delegation attaches one listener to a parent and uses bubbling to handle events from children.', 'DOM Events'],
        ] },
      { title: 'Responsive CSS Layouts', file: 'Responsive_Design_Notes.docx', type: 'DOCX', pages: 19, ago: 1, status: 'Processing', cards: [], questions: [] },
      { title: 'Frontend APIs & Async Data', file: 'Module_04_Web_APIs.pdf', type: 'PDF', pages: 31, ago: 0,
        cards: [['What does fetch() return?', 'A Promise that resolves to a Response object.']],
        questions: [['Which keyword pauses an async function until a Promise settles?', ['yield', 'await', 'then', 'defer'], 1, 'await pauses execution inside an async function until the Promise resolves or rejects.', 'Async JavaScript']] },
    ],
  },
  {
    name: 'Data Structures', code: 'IT 221', icon: 'DSA', color: '#E0F2FE', semester: 'Spring 2025',
    description: 'Arrays, linked lists, stacks, queues, trees and their algorithms.',
    modules: [
      { title: 'Arrays & Linked Lists', file: 'DSA_Lists.pdf', type: 'PDF', pages: 24, ago: 12,
        cards: [['What is a linked list?', 'A linear collection of nodes where each node stores a value and a reference to the next node.'],
                ['Time to access index i in an array?', 'O(1) — arrays support constant-time random access.']],
        questions: [
          ['What is the time complexity of inserting at the head of a singly linked list?', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 0, 'Only the head pointer changes, so it is constant time.', 'Linked Lists'],
          ['Which structure gives O(1) random access by index?', ['Linked list', 'Array', 'Binary tree', 'Hash set'], 1, 'Arrays store elements contiguously, enabling direct index calculation.', 'Arrays & Lists'],
          ['In a doubly linked list each node stores…', ['Only next', 'Only previous', 'Next and previous', 'Index'], 2, 'Doubly linked nodes reference both neighbours.', 'Linked Lists'],
        ] },
      { title: 'Trees & Traversal', file: 'DSA_Trees.pptx', type: 'PPTX', pages: 36, ago: 5,
        cards: [['In-order traversal of a BST yields…', 'The keys in sorted (ascending) order.']],
        questions: [['Which traversal visits root, left, right?', ['In-order', 'Pre-order', 'Post-order', 'Level-order'], 1, 'Pre-order processes the root before its subtrees.', 'Tree Traversal']] },
    ],
  },
  {
    name: 'Network Security', code: 'IT 308', icon: 'NET', color: '#F3E8FF', semester: 'Spring 2025',
    description: 'Protocols, cryptography, PKI and defensive security practices.',
    modules: [
      { title: 'Network Protocols', file: 'NetSec_Protocols.pdf', type: 'PDF', pages: 22, ago: 20,
        cards: [['What port does HTTPS use by default?', '443.'], ['What does TLS provide?', 'Confidentiality, integrity and server authentication for data in transit.']],
        questions: [
          ['Which protocol resolves domain names to IP addresses?', ['DHCP', 'DNS', 'ARP', 'SMTP'], 1, 'DNS translates human-readable names to IP addresses.', 'Network Protocols'],
          ['TCP differs from UDP because TCP is…', ['Connectionless', 'Connection-oriented and reliable', 'Faster in all cases', 'Broadcast only'], 1, 'TCP establishes a connection and guarantees ordered delivery.', 'Network Protocols'],
        ] },
      { title: 'Public Key Infrastructure', file: 'NetSec_PKI.pdf', type: 'PDF', pages: 18, ago: 3,
        cards: [['What is a certificate authority?', 'A trusted entity that signs digital certificates binding a public key to an identity.']],
        questions: [['Which key is used to verify a digital signature?', ['Sender private key', 'Sender public key', 'Receiver private key', 'Shared session key'], 1, 'Signatures are created with the private key and verified with the matching public key.', 'Public Key Infrastructure']] },
    ],
  },
]

// Target accuracy per topic so analytics show clear strengths and weak spots.
const TOPIC_SKILL = {
  'HTML Semantics': 0.85, 'DOM Selection': 0.62, 'DOM Events': 0.42, 'Async JavaScript': 0.6,
  'Linked Lists': 0.5, 'Arrays & Lists': 0.8, 'Tree Traversal': 0.55,
  'Network Protocols': 0.82, 'Public Key Infrastructure': 0.65,
}

export async function seedDemo() {
  if (one('SELECT COUNT(*) AS n FROM users').n > 0) return false
  const hash = await bcrypt.hash('demo1234', 10)

  transaction(() => {
    const userId = Number(run(
      `INSERT INTO users (first_name, last_name, email, password_hash, university, program, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'Alex', 'Morgan', 'demo@university.edu', hash, 'State University', 'BS Information Technology', iso(daysAgo(60)),
    ).lastInsertRowid)
    run('INSERT INTO user_settings (user_id, study_reminders, upcoming_deadlines, weekly_summary) VALUES (?, 1, 1, 0)', userId)

    const insertAnswer = db.prepare('INSERT INTO quiz_answers (attempt_id, question_id, topic, chosen_index, is_correct, answered_at) VALUES (?, ?, ?, ?, ?, ?)')

    for (const subj of SUBJECTS) {
      const subjectId = Number(run(
        'INSERT INTO subjects (user_id, name, code, icon, color, semester, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        userId, subj.name, subj.code, subj.icon, subj.color, subj.semester, subj.description, iso(daysAgo(45)),
      ).lastInsertRowid)

      const subjectQuestions = []
      for (const m of subj.modules) {
        const moduleId = Number(run(
          `INSERT INTO modules (subject_id, user_id, title, file_name, stored_name, mime_type, file_type, size_bytes, pages, status, reviewer, uploaded_at)
           VALUES (?, ?, ?, ?, NULL, '', ?, 0, ?, ?, ?, ?)`,
          subjectId, userId, m.title, m.file, m.type, m.pages, m.status || 'Ready to Study', m.reviewer || '', iso(daysAgo(m.ago, 9)),
        ).lastInsertRowid)
        run("INSERT INTO activities (user_id, subject_id, kind, text, meta, created_at) VALUES (?, ?, 'upload', ?, '', ?)",
          userId, subjectId, `Uploaded “${m.title}”`, iso(daysAgo(m.ago, 9)))

        const cardIds = m.cards.map(([q, a]) => Number(run(
          'INSERT INTO flashcards (module_id, user_id, question, answer) VALUES (?, ?, ?, ?)', moduleId, userId, q, a).lastInsertRowid))
        cardIds.forEach((cid, i) => { for (let k = 0; k < 3 + i; k++) run(
          'INSERT INTO flashcard_reviews (flashcard_id, user_id, result, reviewed_at) VALUES (?, ?, ?, ?)',
          cid, userId, rand() < 0.65 ? 'known' : 'review', iso(daysAgo(Math.floor(rand() * 25), 19))) })

        for (const [q, choices, correct, expl, topic] of m.questions) {
          const id = Number(run(
            'INSERT INTO quiz_questions (module_id, user_id, question, choices, correct_index, explanation, topic) VALUES (?, ?, ?, ?, ?, ?, ?)',
            moduleId, userId, q, JSON.stringify(choices), correct, expl, topic).lastInsertRowid)
          subjectQuestions.push({ id, topic, correct, moduleId })
        }
      }

      // Past quiz attempts over the last ~5 weeks, mixing every question of the subject and slowly improving.
      const attempts = 6
      for (let a = 0; a < attempts; a++) {
        const when = daysAgo(34 - a * 6 - Math.floor(rand() * 3), 14 + (a % 4))
        const improve = a * 0.035
        const mainModule = subjectQuestions[Math.floor(rand() * subjectQuestions.length)].moduleId
        const attemptId = Number(run(
          "INSERT INTO quiz_attempts (user_id, subject_id, module_id, mode, score, total, started_at, completed_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
          userId, subjectId, mainModule, a % 3 === 2 ? 'qa' : 'quiz', iso(when), iso(when)).lastInsertRowid)
        let score = 0
        for (const q of subjectQuestions) {
          const ok = rand() < Math.min(0.97, (TOPIC_SKILL[q.topic] ?? 0.7) + improve) ? 1 : 0
          score += ok
          insertAnswer.run(attemptId, q.id, q.topic, ok ? q.correct : (q.correct + 1) % 4, ok, iso(when))
        }
        run('UPDATE quiz_attempts SET score = ?, total = ? WHERE id = ?', score, subjectQuestions.length, attemptId)
        if (a === attempts - 1) run("INSERT INTO activities (user_id, subject_id, kind, text, meta, created_at) VALUES (?, ?, 'quiz', ?, ?, ?)",
          userId, subjectId, `Completed Quiz: ${subj.name}`, `Score ${Math.round((100 * score) / subjectQuestions.length)}%`, iso(when))
      }

      // Study sessions
      const sessions = subj.code === 'IT 308' ? 21 : subj.code === 'IT 214' ? 18 : 14
      const firstModule = one('SELECT id FROM modules WHERE subject_id = ? ORDER BY id LIMIT 1', subjectId).id
      for (let k = 0; k < sessions; k++) {
        const start = daysAgo(Math.floor(rand() * 40), 18)
        const minutes = 25 + Math.floor(rand() * 40)
        run('INSERT INTO study_sessions (user_id, subject_id, module_id, started_at, ended_at, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)',
          userId, subjectId, firstModule, iso(start), iso(new Date(start.getTime() + minutes * 60000)), minutes)
      }
    }

    const webId = one("SELECT id FROM subjects WHERE user_id = ? AND code = 'IT 214'", userId).id
    const dsaId = one("SELECT id FROM subjects WHERE user_id = ? AND code = 'IT 221'", userId).id
    const netId = one("SELECT id FROM subjects WHERE user_id = ? AND code = 'IT 308'", userId).id

    run("INSERT INTO activities (user_id, subject_id, kind, text, meta, created_at) VALUES (?, ?, 'reviewer', 'Generated a reviewer', '', ?)", userId, netId, iso(daysAgo(2, 11)))

    const tasks = [
      ['Review JavaScript DOM flashcards', 0, 'High', 0],
      ['Finish linked list practice quiz', 1, 'Medium', 0],
      ['Read network protocols notes', 4, 'Low', 1],
    ]
    for (const [t, due, p, done] of tasks) run('INSERT INTO tasks (user_id, title, due_date, priority, done) VALUES (?, ?, ?, ?, ?)', userId, t, dateOnly(daysAhead(due)), p, done)

    const events = [
      [webId, 'Web Development midterm', 2, 'Exam'],
      [null, 'Database schema project', 4, 'Assignment'],
      [netId, 'Network security review', 7, 'Study'],
      [dsaId, 'Coding session: trees', 9, 'Study'],
    ]
    for (const [sid, t, d, type] of events) run('INSERT INTO events (user_id, subject_id, title, event_date, event_time, duration_minutes, type) VALUES (?, ?, ?, ?, ?, 60, ?)', userId, sid, t, dateOnly(daysAhead(d)), '10:00', type)
  })
  return true
}
