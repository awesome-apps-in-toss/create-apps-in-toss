import { Routes, Route, Link } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';

function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/">홈</Link>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
