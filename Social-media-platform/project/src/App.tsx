import React, { useEffect, useState } from 'react';
import { toast, Toaster } from 'react-hot-toast';
import { Users, MessageSquarePlus, Heart, Share2, MessageCircle, Clock } from 'lucide-react';
import { supabase } from './lib/supabase';

type Profile = {
  id: string;
  username: string;
  avatar_url: string;
};

type Post = {
  id: string;
  content: string;
  created_at: string;
  profiles: Profile;
  likes_count: number;
  comments_count: number;
  user_has_liked?: boolean;
};

function App() {
  const [session, setSession] = useState(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState('');
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchFollowersCount(session.user.id);
        fetchPosts();
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Update time left every minute
    const interval = setInterval(updateTimeLeft, 60000);
    updateTimeLeft();

    return () => clearInterval(interval);
  }, []);

  const updateTimeLeft = () => {
    if (followersCount === 0) {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
      const istDate = new Date(now.getTime() + istOffset);
      const hours = istDate.getUTCHours();
      const minutes = istDate.getUTCMinutes();

      if (hours < 10) {
        const minutesLeft = (10 * 60) - (hours * 60 + minutes);
        setTimeLeft(`${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m until posting window`);
      } else if (hours === 10 && minutes <= 30) {
        setTimeLeft(`${30 - minutes}m left to post`);
      } else {
        const hoursUntilTomorrow = 24 - hours + 10;
        setTimeLeft(`${hoursUntilTomorrow}h until next posting window`);
      }
    } else {
      setTimeLeft('');
    }
  };

  const fetchFollowersCount = async (userId: string) => {
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact' })
      .eq('following_id', userId);
    
    setFollowersCount(count || 0);
  };

  const fetchPosts = async () => {
    if (!session?.user?.id) return;

    const { data: likesData } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', session.user.id);

    const userLikedPosts = new Set(likesData?.map(like => like.post_id) || []);

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:user_id (
          id,
          username,
          avatar_url
        ),
        likes_count:likes(count),
        comments_count:comments(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error fetching posts');
    } else {
      setPosts(data.map(post => ({
        ...post,
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        user_has_liked: userLikedPosts.has(post.id)
      })));
    }
    setLoading(false);
  };

  const canPostNow = () => {
    // Convert current time to IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + istOffset);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    if (followersCount === 0) {
      // Can post only between 10:00-10:30 AM IST
      const startTime = 10 * 60; // 10:00 AM in minutes
      const endTime = 10 * 60 + 30; // 10:30 AM in minutes
      return timeInMinutes >= startTime && timeInMinutes <= endTime;
    } else if (followersCount >= 2 && followersCount < 10) {
      // Can post twice per day
      const todayPosts = posts.filter(post => {
        const postDate = new Date(post.created_at);
        return post.profiles.id === session?.user?.id &&
          postDate.toDateString() === now.toDateString();
      });
      return todayPosts.length < 2;
    } else if (followersCount >= 10) {
      // Can post multiple times
      return true;
    }
    return false;
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canPostNow()) {
      toast.error('You cannot post at this time based on your follower count');
      return;
    }

    const { error } = await supabase
      .from('posts')
      .insert([
        { content, user_id: session?.user?.id }
      ]);

    if (error) {
      toast.error('Error creating post');
    } else {
      toast.success('Post created!');
      setContent('');
      fetchPosts();
    }
  };

  const handleLike = async (postId: string, currentlyLiked: boolean) => {
    if (!session?.user?.id) return;

    if (currentlyLiked) {
      await supabase
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', session.user.id);
    } else {
      await supabase
        .from('likes')
        .insert([
          { post_id: postId, user_id: session.user.id }
        ]);
    }

    fetchPosts();
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-xl w-96 text-center">
          <h1 className="text-3xl font-bold mb-2">Social Space</h1>
          <p className="text-gray-600 mb-8">Connect with friends and share your thoughts</p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })}
            className="w-full bg-gray-900 text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            <span>Sign in with GitHub</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">Social Space</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
              <Users className="w-5 h-5 mr-1 text-blue-600" />
              <span className="font-medium">{followersCount} followers</span>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-gray-600 hover:text-gray-900 bg-gray-100 px-3 py-1 rounded-full transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <form onSubmit={handlePost}>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-500 space-y-1">
                <p>
                  {followersCount === 0 && "You can post once between 10:00-10:30 AM IST"}
                  {followersCount >= 2 && followersCount < 10 && "You can post twice per day"}
                  {followersCount >= 10 && "You can post multiple times per day"}
                </p>
                {timeLeft && (
                  <p className="flex items-center text-blue-600">
                    <Clock className="w-4 h-4 mr-1" />
                    {timeLeft}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={!canPostNow() || !content.trim()}
                className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
              >
                <MessageSquarePlus className="w-5 h-5 mr-2" />
                Post
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-500">Loading posts...</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-md">
              <MessageSquarePlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No posts yet</p>
              <p className="text-gray-400">Be the first one to post!</p>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <img
                    src={post.profiles.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles.username}&background=random`}
                    alt={post.profiles.username}
                    className="w-12 h-12 rounded-full mr-3"
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900">{post.profiles.username}</h3>
                    <p className="text-sm text-gray-500">
                      {formatTimeAgo(post.created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-gray-800 text-lg mb-4">{post.content}</p>
                <div className="flex items-center space-x-6 text-gray-500">
                  <button
                    onClick={() => handleLike(post.id, post.user_has_liked)}
                    className={`flex items-center space-x-2 transition-colors ${
                      post.user_has_liked ? 'text-red-500 hover:text-red-600' : 'hover:text-gray-700'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${post.user_has_liked ? 'fill-current' : ''}`} />
                    <span>{post.likes_count}</span>
                  </button>
                  <button className="flex items-center space-x-2 hover:text-gray-700 transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span>{post.comments_count}</span>
                  </button>
                  <button className="flex items-center space-x-2 hover:text-gray-700 transition-colors">
                    <Share2 className="w-5 h-5" />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

export default App;