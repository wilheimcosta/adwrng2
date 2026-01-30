-- Create enum for alert status
CREATE TYPE public.alert_status AS ENUM ('active', 'expired', 'archived');

-- Create enum for alert severity
CREATE TYPE public.alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Create table for favorite ICAOs
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icao TEXT NOT NULL CHECK (icao ~ '^[A-Z]{4}$'),
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for alert history
CREATE TABLE public.alerts_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  icao TEXT NOT NULL CHECK (icao ~ '^[A-Z]{4}$'),
  alert_type TEXT NOT NULL,
  content TEXT NOT NULL,
  status alert_status DEFAULT 'active',
  severity alert_severity DEFAULT 'medium',
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_until TIMESTAMP WITH TIME ZONE,
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for user settings
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_interval INTEGER DEFAULT 300 CHECK (check_interval >= 60 AND check_interval <= 3600),
  audio_enabled BOOLEAN DEFAULT true,
  sound_theme TEXT DEFAULT 'default',
  overlay_enabled BOOLEAN DEFAULT true,
  overlay_duration INTEGER DEFAULT 5 CHECK (overlay_duration >= 1 AND overlay_duration <= 30),
  notifications_enabled BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for favorites (public app - everyone can CRUD)
CREATE POLICY "Anyone can view favorites"
  ON public.favorites FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert favorites"
  ON public.favorites FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update favorites"
  ON public.favorites FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete favorites"
  ON public.favorites FOR DELETE
  USING (true);

-- RLS Policies for alerts_history (public app - everyone can CRUD)
CREATE POLICY "Anyone can view alerts"
  ON public.alerts_history FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert alerts"
  ON public.alerts_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update alerts"
  ON public.alerts_history FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete alerts"
  ON public.alerts_history FOR DELETE
  USING (true);

-- RLS Policies for settings (public app - everyone can CRUD)
CREATE POLICY "Anyone can view settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert settings"
  ON public.settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update settings"
  ON public.settings FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete settings"
  ON public.settings FOR DELETE
  USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON public.favorites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_alerts_history_updated_at
  BEFORE UPDATE ON public.alerts_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_favorites_icao ON public.favorites(icao);
CREATE INDEX idx_favorites_enabled ON public.favorites(enabled);
CREATE INDEX idx_alerts_history_icao ON public.alerts_history(icao);
CREATE INDEX idx_alerts_history_status ON public.alerts_history(status);
CREATE INDEX idx_alerts_history_created_at ON public.alerts_history(created_at DESC);
CREATE INDEX idx_alerts_history_severity ON public.alerts_history(severity);

-- Enable realtime for alerts_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts_history;