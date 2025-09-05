const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Base de données test (à remplacer par une vraie DB)
let users = [
  { id: 1, username: 'admin', password: '$2a$10$...' /* hash de 'admin123' */, role: 'admin', name: 'Administrateur', points: 0 },
  { id: 2, username: 'animateur1', password: '$2a$10$...', role: 'animateur', name: 'Jean Dupont', points: 0 },
  { id: 3, username: 'enfant1', password: '$2a$10$...', role: 'enfant', name: 'Emma Martin', points: 500, animateurId: 2 }
];

let shopItems = [
  { id: 1, name: 'Badge VEX Champion', price: 100, description: 'Badge collector officiel VEX', category: 'badge' },
  { id: 2, name: 'Kit capteurs bonus', price: 300, description: 'Capteurs supplémentaires pour projets', category: 'materiel' }
];

let userProgress = {
  3: { 'cahier': 60, 'algo-basic': 40 }
};

// Routes d'authentification
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ message: 'Utilisateur non trouvé' });
  }
  
  // En production, utiliser bcrypt.compare(password, user.password)
  if (password === 'admin123' || password === 'anim123' || password === 'enfant123') {
    const token = jwt.sign(
      { userId: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'votre_secret_jwt',
      { expiresIn: '24h' }
    );
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        name: user.name, 
        points: user.points 
      } 
    });
  } else {
    res.status(401).json({ message: 'Mot de passe incorrect' });
  }
});

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Token manquant' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'votre_secret_jwt', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Routes pour les utilisateurs
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role === 'admin') {
    res.json(users.map(u => ({ ...u, password: undefined })));
  } else if (req.user.role === 'animateur') {
    const myStudents = users.filter(u => u.role === 'enfant' && u.animateurId === req.user.userId);
    res.json(myStudents.map(u => ({ ...u, password: undefined })));
  } else {
    res.status(403).json({ message: 'Accès refusé' });
  }
});

app.post('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Seuls les admins peuvent créer des utilisateurs' });
  }
  
  const { username, password, name, role } = req.body;
  const newId = Math.max(...users.map(u => u.id)) + 1;
  
  // En production, hasher le mot de passe avec bcrypt
  const hashedPassword = password; // bcrypt.hashSync(password, 10);
  
  const newUser = {
    id: newId,
    username,
    password: hashedPassword,
    name,
    role,
    points: 0,
    animateurId: role === 'enfant' ? req.user.userId : null
  };
  
  users.push(newUser);
  res.json({ ...newUser, password: undefined });
});

// Routes pour le shop
app.get('/api/shop', authenticateToken, (req, res) => {
  res.json(shopItems);
});

app.post('/api/shop', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Seuls les admins peuvent créer des objets' });
  }
  
  const { name, price, description, category } = req.body;
  const newId = Math.max(...shopItems.map(i => i.id)) + 1;
  
  const newItem = { id: newId, name, price: parseInt(price), description, category };
  shopItems.push(newItem);
  res.json(newItem);
});

// Achat d'objet
app.post('/api/shop/:itemId/buy', authenticateToken, (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const item = shopItems.find(i => i.id === itemId);
  const user = users.find(u => u.id === req.user.userId);
  
  if (!item) {
    return res.status(404).json({ message: 'Objet non trouvé' });
  }
  
  if (user.points < item.price) {
    return res.status(400).json({ message: 'Points insuffisants' });
  }
  
  user.points -= item.price;
  res.json({ message: 'Achat réussi', newPoints: user.points });
});

// Routes pour la progression
app.get('/api/progress/:userId?', authenticateToken, (req, res) => {
  const userId = req.params.userId || req.user.userId;
  res.json(userProgress[userId] || {});
});

app.put('/api/progress/:userId', authenticateToken, (req, res) => {
  if (req.user.role !== 'animateur' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  
  const userId = parseInt(req.params.userId);
  const { skillId, points } = req.body;
  
  // Ajouter points à l'utilisateur
  const user = users.find(u => u.id === userId);
  if (user) {
    user.points += points;
  }
  
  // Mettre à jour la progression
  if (!userProgress[userId]) {
    userProgress[userId] = {};
  }
  userProgress[userId][skillId] = Math.min(100, (userProgress[userId][skillId] || 0) + 20);
  
  res.json({ message: 'Progression mise à jour' });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
