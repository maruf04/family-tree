import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireMember, RequireModerator } from './auth/guards.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';

// Heavier sections load on demand (React Flow, Leaflet).
const History = lazy(() => import('./pages/History.jsx'));
const Families = lazy(() => import('./pages/Families.jsx'));
const FamilyDetail = lazy(() => import('./pages/FamilyDetail.jsx'));
const Person = lazy(() => import('./pages/Person.jsx'));
const TreePage = lazy(() => import('./pages/TreePage.jsx'));
const Directory = lazy(() => import('./pages/Directory.jsx'));
const Community = lazy(() => import('./pages/Community.jsx'));
const PostDetail = lazy(() => import('./pages/PostDetail.jsx'));
const Affairs = lazy(() => import('./pages/Affairs.jsx'));
const NewsArticle = lazy(() => import('./pages/NewsArticle.jsx'));
const Proposals = lazy(() => import('./pages/Proposals.jsx'));
const ProposalDetail = lazy(() => import('./pages/ProposalDetail.jsx'));
const Moderation = lazy(() => import('./pages/Moderation.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Verify = lazy(() => import('./pages/Verify.jsx'));

const member = (el) => <RequireMember>{el}</RequireMember>;

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route path="verify" element={<Verify />} />
          <Route path="history" element={member(<History />)} />
          <Route path="families" element={member(<Families />)} />
          <Route path="families/:id" element={member(<FamilyDetail />)} />
          <Route path="people/:id" element={member(<Person />)} />
          <Route path="people/:id/tree" element={member(<TreePage />)} />
          <Route path="directory" element={member(<Directory />)} />
          <Route path="community" element={member(<Community />)} />
          <Route path="community/posts/:id" element={member(<PostDetail />)} />
          <Route path="affairs" element={member(<Affairs />)} />
          <Route path="affairs/news/:id" element={member(<NewsArticle />)} />
          <Route path="proposals" element={member(<Proposals />)} />
          <Route path="proposals/:id" element={member(<ProposalDetail />)} />
          <Route path="moderation" element={<RequireModerator><Moderation /></RequireModerator>} />
          <Route path="admin" element={<RequireModerator><Admin /></RequireModerator>} />
          <Route path="account" element={member(<Account />)} />
          <Route path="notifications" element={member(<Notifications />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
