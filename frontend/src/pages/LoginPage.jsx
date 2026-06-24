import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const API_BASE_URL = 'http://127.0.0.1:8000';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@tdm.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password,
      });

      if (response.data.status === 'SUCCESS') {
        const user = response.data.user;

        // Store backend session id
        try {
          const sessionResponse = await axios.get(`${API_BASE_URL}/`);
          const latestBackendSessionId = sessionResponse.data.backend_session_id;
          sessionStorage.setItem('tdm_backend_session_id', latestBackendSessionId);
        } catch (err) {
          console.error(err);
        }

        login(user);
        navigate(user.role === 'admin' ? '/admin/dashboard' : '/dev/dashboard');
      } else {
        setError(response.data.message || 'Login failed.');
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError('Unable to connect to backend login API.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-950 p-8 text-white shadow-2xl">
          <div className="inline-flex rounded-3xl bg-white/10 p-4">
            <Shield className="h-10 w-10" />
          </div>

          <p className="mt-8 text-[13px] font-medium uppercase tracking-wide text-slate-400">
            TDM Secure Workspace
          </p>

          <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
            Data Anonymization Control Center
          </h1>

          <p className="mt-5 max-w-xl text-[13px] leading-6 text-slate-300 md:text-[14px]">
            Sign in to access extraction, synthetic test data generation, anonymization,
            job monitoring, audit validation, role-based access, and assistant-driven TDM support.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Admin</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Full access to dashboards, data inventory, rule configuration, pipelines,
                monitoring, user access, and configuration.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Developer</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Access to assigned workflows, data classification, masking, pipeline execution,
                preview, and job monitoring.
              </p>
            </div>
          </div>
        </div>

        <Card className="rounded-3xl shadow-xl">
          <CardContent className="p-8">
            <h2 className="text-xl font-bold text-slate-950">Sign in</h2>
            <p className="mt-2 text-[13px] text-slate-500">Use demo credentials to enter the MVP.</p>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setEmail('admin@tdm.com');
                  setPassword('Admin@123');
                }}
              >
                Use Admin
              </Button>

              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  setEmail('developer@tdm.com');
                  setPassword('Dev@123');
                }}
              >
                Use Developer
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="text-[13px] font-medium text-slate-700">Email</label>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none"
                  placeholder="admin@tdm.com"
                />
              </div>

              <div>
                <label className="text-[13px] font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] outline-none"
                  placeholder="Password"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              <Button onClick={handleLogin} disabled={loading} className="w-full rounded-xl">
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-[11px] text-slate-600">
              <p className="font-medium text-slate-800">Demo credentials</p>
              <p className="mt-2">Admin: admin@tdm.com / Admin@123</p>
              <p>Developer: developer@tdm.com / Dev@123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
