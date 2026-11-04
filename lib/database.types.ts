export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          password_hash: string | null
          role: 'USER' | 'TIDYPRO' | 'ADMIN'
          email: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          status: string
          street_address: string | null
          zip_code: string | null
          service_area_id: string | null
          booking_access_status: 'waitlisted' | 'booking_allowed' | 'paused' | 'closed' | 'denied'
          booking_access_granted_at: string | null
          waitlisted: boolean
          waitlisted_at: string | null
          terms_accepted_at: string | null
          privacy_policy_accepted_at: string | null
          email_verified_at: string | null
          custom_rooms: string[] | null
          BGCheckStatus: string
          last_sign_in_at: string | null
          photo_url: string | null
          promo_code: string | null
          pets: string | null
          sms_notifications_enabled: boolean
          email_notifications_enabled: boolean
          stripe_customer_id: string | null
          sms_consent: 'opted_in' | 'declined' | null
          push_consent: 'opted_in' | 'declined' | null
          suspended_at: string | null
          banned_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          auth_user_id?: string | null
          password_hash?: string | null
          role: 'USER' | 'TIDYPRO' | 'ADMIN'
          email: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          status?: string
          street_address?: string | null
          zip_code?: string | null
          service_area_id?: string | null
          booking_access_status?: 'waitlisted' | 'booking_allowed' | 'paused' | 'closed' | 'denied'
          booking_access_granted_at?: string | null
          waitlisted?: boolean
          waitlisted_at?: string | null
          terms_accepted_at?: string | null
          privacy_policy_accepted_at?: string | null
          email_verified_at?: string | null
          custom_rooms?: string[] | null
          BGCheckStatus?: string
          last_sign_in_at?: string | null
          photo_url?: string | null
          promo_code?: string | null
          pets?: string | null
          sms_notifications_enabled?: boolean
          email_notifications_enabled?: boolean
          stripe_customer_id?: string | null
          sms_consent?: 'opted_in' | 'declined' | null
          push_consent?: 'opted_in' | 'declined' | null
          suspended_at?: string | null
          banned_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      tidypro_profiles: {
        Row: {
          id: string
          bio: string | null
          profile_photo_url: string | null
          street_address: string | null
          city: string | null
          state: string | null
          zip_code: string | null
          latitude: number | null
          longitude: number | null
          phone: string | null
          availability: Json
          current_period_earnings: number
          total_earnings: number
          allergies: Json
          rating: number
          review_count: number
          is_verified: boolean
          stripe_account_id: string | null
          stripe_onboarding_completed: boolean
          travel_radius_miles: number | null
          average_response_time_minutes: number | null
          is_insured: boolean
          // MVP additions
          terms_accepted: boolean
          terms_accepted_at: string | null
          cleaner_status: string
          approved_at: string | null
          approved_by: string | null
          paused_at: string | null
          pause_reason: string | null
          booking_alerts_enabled: boolean
          sms_notifications_enabled: boolean
          email_notifications_enabled: boolean
          total_accepted_bookings: number
          total_cancelled_bookings: number
          pending_earnings: number
          paid_earnings: number
          total_tips: number
          insurance_status: string | null
          insurance_provider: string | null
          insurance_policy_expiration_date: string | null
          insurance_expiry_reminder_sent_at: string | null
          insurance_document_url: string | null
          insurance_verified_at: string | null
          insurance_verified_by: string | null
          insurance_denial_reason: string | null
          insurance_submitted_at: string | null
          payout_paused_until: string | null
          payout_pause_reason: string | null
          service_area_ids: string[] | null
          service_zip_codes: string[] | null
          active_for_booking: boolean
          sms_consent: 'opted_in' | 'declined' | null
          push_consent: 'opted_in' | 'declined' | null
          verified_ack_at: string | null
          is_away: boolean
          time_zone: string | null
          date_of_birth: string | null
          legal_middle_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          bio?: string | null
          profile_photo_url?: string | null
          street_address?: string | null
          city?: string | null
          state?: string | null
          zip_code?: string | null
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          availability?: Json
          current_period_earnings?: number
          total_earnings?: number
          allergies?: Json
          rating?: number
          review_count?: number
          is_verified?: boolean
          stripe_account_id?: string | null
          stripe_onboarding_completed?: boolean
          travel_radius_miles?: number | null
          average_response_time_minutes?: number | null
          is_insured?: boolean
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          cleaner_status?: string
          approved_at?: string | null
          approved_by?: string | null
          paused_at?: string | null
          pause_reason?: string | null
          booking_alerts_enabled?: boolean
          sms_notifications_enabled?: boolean
          email_notifications_enabled?: boolean
          total_accepted_bookings?: number
          total_cancelled_bookings?: number
          pending_earnings?: number
          paid_earnings?: number
          total_tips?: number
          insurance_status?: string | null
          insurance_provider?: string | null
          insurance_policy_expiration_date?: string | null
          insurance_expiry_reminder_sent_at?: string | null
          insurance_document_url?: string | null
          insurance_verified_at?: string | null
          insurance_verified_by?: string | null
          insurance_denial_reason?: string | null
          insurance_submitted_at?: string | null
          payout_paused_until?: string | null
          payout_pause_reason?: string | null
          service_area_ids?: string[] | null
          service_zip_codes?: string[] | null
          active_for_booking?: boolean
          sms_consent?: 'opted_in' | 'declined' | null
          push_consent?: 'opted_in' | 'declined' | null
          verified_ack_at?: string | null
          is_away?: boolean
          time_zone?: string | null
          date_of_birth?: string | null
          legal_middle_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tidypro_profiles']['Insert']>
        Relationships: []
      }
      background_checks: {
        Row: {
          id: number
          pro_id: string
          provider: string | null
          status: string
          reference: string | null
          checkr_invitation_id: string | null
          report_id: string | null
          result: string | null
          background_check_manual_review_notes: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          fee_amount_cents: number | null
          fee_paid_at: string | null
          fee_terms_accepted_at: string | null
          fee_terms_amount_cents: number | null
          fee_refunded_at: string | null
          fee_refund_reason: string | null
          stripe_refund_id: string | null
          adverse_notice_undelivered_at: string | null
          submitted_at: string | null
          manual_decision_at: string | null
          manual_decision_note: string | null
          requested_at: string | null
          link_sent_at: string | null
          background_check_link: string | null
          id_verification_sent_at: string | null
          id_verification_link: string | null
          background_check_completed_at: string | null
          id_verification_completed_at: string | null
          denied_at: string | null
          denial_reason: string | null
          appeal_token: string | null
          appeal_message: string | null
          appeal_submitted_at: string | null
          invited_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          pro_id: string
          provider?: string | null
          status: string
          reference?: string | null
          checkr_invitation_id?: string | null
          report_id?: string | null
          result?: string | null
          background_check_manual_review_notes?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          fee_amount_cents?: number | null
          fee_paid_at?: string | null
          fee_terms_accepted_at?: string | null
          fee_terms_amount_cents?: number | null
          fee_refunded_at?: string | null
          fee_refund_reason?: string | null
          stripe_refund_id?: string | null
          adverse_notice_undelivered_at?: string | null
          submitted_at?: string | null
          manual_decision_at?: string | null
          manual_decision_note?: string | null
          requested_at?: string | null
          link_sent_at?: string | null
          background_check_link?: string | null
          id_verification_sent_at?: string | null
          id_verification_link?: string | null
          background_check_completed_at?: string | null
          id_verification_completed_at?: string | null
          denied_at?: string | null
          denial_reason?: string | null
          appeal_token?: string | null
          appeal_message?: string | null
          appeal_submitted_at?: string | null
          invited_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['background_checks']['Insert']>
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          user_id: string
          tidy_pro_id: string | null
          start_time: string | null
          end_time: string | null
          status: string | null
          tidy_pro_name: string | null
          tidy_pro_photo_url: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          task_amount: number | null
          service_fee: number | null
          total_amount: number | null
          task_description: string | null
          will_provide_supplies: boolean
          estimated_duration_minutes: number | null
          decision_status: string
          progress_status: string | null
          review_page_seen: boolean
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          stripe_refund_id: string | null
          // MVP additions
          task_list: Json | null
          pricing_version: string | null
          pricing_breakdown: Json | null
          tip: number
          customer_subtotal: number | null
          total_customer_charge: number | null
          cleaner_pay: number | null
          quote_locked_at: string | null
          unusual_notes: string | null
          stripe_payment_link: string | null
          cleaner_marked_complete_at: string | null
          customer_dispute_deadline: string | null
          payout_release_at: string | null
          payment_release_token: string | null
          payout_released_by_customer: boolean
          pets: string | null
          notes: string | null
          entry_instructions: string | null
          request_group_id: string | null
          time_zone: string
          cancelled_reason: string | null
          scheduled_location: Json | null
          user_unread: boolean
          tidy_pro_unread: boolean
          reminder_sent_at: string | null
          on_the_way_reminder_sent_at: string | null
          unresponsive_alert_sent_at: string | null
          arrived_at: string | null
          incident_type: 'no_access' | 'cleaner_no_show' | null
          incident_reported_at: string | null
          incident_resolved_at: string | null
          incident_refund_level: 'full' | 'half' | 'none' | null
          incident_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tidy_pro_id?: string | null
          start_time?: string | null
          end_time?: string | null
          status?: string | null
          tidy_pro_name?: string | null
          tidy_pro_photo_url?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          task_amount?: number | null
          service_fee?: number | null
          total_amount?: number | null
          task_description?: string | null
          will_provide_supplies?: boolean
          estimated_duration_minutes?: number | null
          decision_status?: string
          progress_status?: string | null
          review_page_seen?: boolean
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          stripe_refund_id?: string | null
          task_list?: Json | null
          pricing_version?: string | null
          pricing_breakdown?: Json | null
          tip?: number
          customer_subtotal?: number | null
          total_customer_charge?: number | null
          cleaner_pay?: number | null
          quote_locked_at?: string | null
          unusual_notes?: string | null
          stripe_payment_link?: string | null
          cleaner_marked_complete_at?: string | null
          customer_dispute_deadline?: string | null
          payout_release_at?: string | null
          payment_release_token?: string | null
          payout_released_by_customer?: boolean
          pets?: string | null
          notes?: string | null
          entry_instructions?: string | null
          request_group_id?: string | null
          time_zone?: string
          cancelled_reason?: string | null
          scheduled_location?: Json | null
          user_unread?: boolean
          tidy_pro_unread?: boolean
          reminder_sent_at?: string | null
          on_the_way_reminder_sent_at?: string | null
          unresponsive_alert_sent_at?: string | null
          arrived_at?: string | null
          incident_type?: 'no_access' | 'cleaner_no_show' | null
          incident_reported_at?: string | null
          incident_resolved_at?: string | null
          incident_refund_level?: 'full' | 'half' | 'none' | null
          incident_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
        Relationships: []
      }
      booking_messages: {
        Row: {
          id: string
          booking_id: string
          sender_role: string
          body: string
          created_at: string
          kind: string
          proposed_date: string | null
          proposed_time: string | null
          proposal_status: string | null
        }
        Insert: {
          id?: string
          booking_id: string
          sender_role: string
          body: string
          created_at?: string
          kind?: string
          proposed_date?: string | null
          proposed_time?: string | null
          proposal_status?: string | null
        }
        Update: Partial<Database['public']['Tables']['booking_messages']['Insert']>
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['push_subscriptions']['Insert']>
        Relationships: []
      }
      booking_tasks: {
        Row: {
          id: string
          booking_id: string
          task_name: string
          task_category: string
          task_icon: string | null
          is_completed: boolean
          completion_photo_url: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          task_name: string
          task_category: string
          task_icon?: string | null
          is_completed?: boolean
          completion_photo_url?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_tasks']['Insert']>
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          booking_id: string
          user_id: string
          tidypro_id: string
          rating: number
          review_text: string | null
          tip_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          user_id: string
          tidypro_id: string
          rating: number
          review_text?: string | null
          tip_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>
        Relationships: []
      }
      booking_request_groups: {
        Row: {
          id: string
          user_id: string
          original_booking_id: string
          stripe_payment_intent_id: string
          amount_cents: number
          status: string
          accepted_booking_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          original_booking_id: string
          stripe_payment_intent_id: string
          amount_cents: number
          status?: string
          accepted_booking_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_request_groups']['Insert']>
        Relationships: []
      }
      booking_drafts: {
        Row: {
          id: string
          customer_user_id: string
          task_list: Json | null
          pricing_breakdown: Json | null
          last_step_reached: number
          scheduled_location: Json | null
          scheduled_date: string | null
          any_day_selected: boolean
          scheduled_time: string | null
          selected_tidy_pro_id: string | null
          pets: string | null
          notes: string | null
          supplies_provided: boolean
          gift_code: string | null
          selected_payment_method_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_user_id: string
          task_list?: Json | null
          pricing_breakdown?: Json | null
          last_step_reached?: number
          scheduled_location?: Json | null
          scheduled_date?: string | null
          any_day_selected?: boolean
          scheduled_time?: string | null
          selected_tidy_pro_id?: string | null
          pets?: string | null
          notes?: string | null
          supplies_provided?: boolean
          gift_code?: string | null
          selected_payment_method_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_drafts']['Insert']>
        Relationships: []
      }
      payment_methods: {
        Row: {
          id: string
          user_id: string
          stripe_payment_method_id: string
          card_brand: string
          card_last4: string
          card_exp_month: number
          card_exp_year: number
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_payment_method_id: string
          card_brand: string
          card_last4: string
          card_exp_month: number
          card_exp_year: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['payment_methods']['Insert']>
        Relationships: []
      }
      promo_codes: {
        Row: {
          id: string
          code: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['promo_codes']['Insert']>
        Relationships: []
      }
      job_notifications: {
        Row: {
          id: string
          booking_id: string
          tidypro_id: string
          claim_token: string
          status: string
          sent_at: string | null
          claimed_at: string | null
          expired_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          tidypro_id: string
          claim_token: string
          status?: string
          sent_at?: string | null
          claimed_at?: string | null
          expired_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['job_notifications']['Insert']>
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          booking_id: string
          stripe_session_id: string | null
          stripe_payment_intent_id: string | null
          amount: number
          cleaner_pay: number
          platform_fee: number
          tip: number
          status: string
          paid_at: string | null
          payout_status: string
          payout_released_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          stripe_session_id?: string | null
          stripe_payment_intent_id?: string | null
          amount: number
          cleaner_pay: number
          platform_fee: number
          tip?: number
          status?: string
          paid_at?: string | null
          payout_status?: string
          payout_released_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: []
      }
      notification_batches: {
        Row: {
          id: string
          booking_id: string
          tidypro_count: number
          sms_sent: number
          email_sent: number
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          tidypro_count: number
          sms_sent: number
          email_sent: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notification_batches']['Insert']>
        Relationships: []
      }
      completion_events: {
        Row: {
          id: string
          booking_id: string
          type: string
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          type: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['completion_events']['Insert']>
        Relationships: []
      }
      customer_reviews_of_cleaners: {
        Row: {
          id: string
          booking_id: string
          customer_id: string | null
          tidypro_id: string | null
          review_token: string
          overall_rating: number | null
          quality_rating: number | null
          timeliness_rating: number | null
          communication_rating: number | null
          written_feedback: string | null
          submitted_at: string | null
          manual_decision_at: string | null
          manual_decision_note: string | null
          requested_at: string | null
          link_sent_at: string | null
          background_check_link: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          customer_id?: string | null
          tidypro_id?: string | null
          review_token: string
          overall_rating?: number | null
          quality_rating?: number | null
          timeliness_rating?: number | null
          communication_rating?: number | null
          written_feedback?: string | null
          submitted_at?: string | null
          manual_decision_at?: string | null
          manual_decision_note?: string | null
          requested_at?: string | null
          link_sent_at?: string | null
          background_check_link?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['customer_reviews_of_cleaners']['Insert']>
        Relationships: []
      }
      cleaner_reviews_of_customers: {
        Row: {
          id: string
          booking_id: string
          tidypro_id: string | null
          customer_id: string | null
          review_token: string
          customer_rating: number | null
          communication_rating: number | null
          access_instructions_rating: number | null
          safety_comfort_rating: number | null
          would_clean_again: boolean | null
          written_feedback: string | null
          submitted_at: string | null
          manual_decision_at: string | null
          manual_decision_note: string | null
          requested_at: string | null
          link_sent_at: string | null
          background_check_link: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          tidypro_id?: string | null
          customer_id?: string | null
          review_token: string
          customer_rating?: number | null
          communication_rating?: number | null
          access_instructions_rating?: number | null
          safety_comfort_rating?: number | null
          would_clean_again?: boolean | null
          written_feedback?: string | null
          submitted_at?: string | null
          manual_decision_at?: string | null
          manual_decision_note?: string | null
          requested_at?: string | null
          link_sent_at?: string | null
          background_check_link?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cleaner_reviews_of_customers']['Insert']>
        Relationships: []
      }
      banned_users: {
        Row: {
          id: string
          email: string
          phones_normalized: string[]
          first_name: string | null
          last_name: string | null
          note: string | null
          former_profile_id: string | null
          fee_amount_cents: number | null
          stripe_payment_intent_id: string | null
          banned_at: string
          appeal_token: string | null
          appeal_message: string | null
          appeal_submitted_at: string | null
          appeal_denied_at: string | null
          account_deleted_at: string | null
        }
        Insert: {
          id?: string
          email: string
          phones_normalized?: string[]
          first_name?: string | null
          last_name?: string | null
          note?: string | null
          former_profile_id?: string | null
          fee_amount_cents?: number | null
          stripe_payment_intent_id?: string | null
          banned_at?: string
          appeal_token?: string | null
          appeal_message?: string | null
          appeal_submitted_at?: string | null
          appeal_denied_at?: string | null
          account_deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['banned_users']['Insert']>
        Relationships: []
      }
      booking_calls: {
        Row: {
          id: string
          booking_id: string
          caller_role: 'USER' | 'TIDYPRO'
          twilio_call_sid: string
          status: string | null
          duration_seconds: number | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          caller_role: 'USER' | 'TIDYPRO'
          twilio_call_sid: string
          status?: string | null
          duration_seconds?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_calls']['Insert']>
        Relationships: []
      }
      deleted_accounts: {
        Row: {
          id: string
          former_profile_id: string
          email: string
          first_name: string | null
          last_name: string | null
          role: string
          deleted_at: string
        }
        Insert: {
          id?: string
          former_profile_id: string
          email: string
          first_name?: string | null
          last_name?: string | null
          role: string
          deleted_at?: string
        }
        Update: Partial<Database['public']['Tables']['deleted_accounts']['Insert']>
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          id: string
          key: string
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['rate_limit_events']['Insert']>
        Relationships: []
      }
      agreement_signatures: {
        Row: {
          id: string
          pro_id: string | null
          agreement_version: string
          document_sha256: string
          signed_name: string
          business_entity: string | null
          authorized_representative: string | null
          address: string
          account_name: string | null
          account_email: string
          ip_address: string | null
          user_agent: string | null
          consent_text: string
          signed_pdf_path: string
          signed_at: string
          emailed_at: string | null
        }
        Insert: {
          id?: string
          pro_id?: string | null
          agreement_version: string
          document_sha256: string
          signed_name: string
          business_entity?: string | null
          authorized_representative?: string | null
          address: string
          account_name?: string | null
          account_email: string
          ip_address?: string | null
          user_agent?: string | null
          consent_text: string
          signed_pdf_path: string
          signed_at?: string
          emailed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['agreement_signatures']['Insert']>
        Relationships: []
      }
      user_addresses: {
        Row: {
          id: string
          user_id: string
          label: string
          street_address: string
          city: string
          state: string
          zip_code: string
          unit_number: string | null
          latitude: number | null
          longitude: number | null
          is_default: boolean
          square_footage: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          label: string
          street_address: string
          city: string
          state: string
          zip_code: string
          unit_number?: string | null
          latitude?: number | null
          longitude?: number | null
          is_default?: boolean
          square_footage?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_addresses']['Insert']>
        Relationships: []
      }
      risk_events: {
        Row: {
          id: string
          event_type: 'customer_complaint' | 'cleaner_no_show' | 'chargeback' | 'refund_requested' | 'bank_account_changed' | 'duplicate_cleaner_detected' | 'suspicious_booking' | string
          booking_id: string | null
          user_id: string | null
          severity: 'low' | 'medium' | 'high' | 'critical'
          description: string | null
          metadata: Json | null
          resolved_at: string | null
          resolution_notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_type: string
          booking_id?: string | null
          user_id?: string | null
          severity?: 'low' | 'medium' | 'high' | 'critical'
          description?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          resolution_notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['risk_events']['Insert']>
        Relationships: []
      }
      service_areas: {
        Row: {
          id: string
          name: string
          status: 'waitlist_only' | 'beta_open' | 'paused_recruiting_cleaners' | 'closed'
          city: string | null
          state: string
          market_price: number | null
          market_price_summary: string | null
          market_price_researched_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          status?: 'waitlist_only' | 'beta_open' | 'paused_recruiting_cleaners' | 'closed'
          city?: string | null
          state?: string
          market_price?: number | null
          market_price_summary?: string | null
          market_price_researched_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['service_areas']['Insert']>
        Relationships: []
      }
      state_pricing: {
        Row: {
          id: string
          state: string
          median_four_hour_price: number
          pricing_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          state: string
          median_four_hour_price: number
          pricing_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['state_pricing']['Insert']>
        Relationships: []
      }
      service_area_zip_codes: {
        Row: {
          id: string
          service_area_id: string
          zip_code: string
          created_at: string
        }
        Insert: {
          id?: string
          service_area_id: string
          zip_code: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['service_area_zip_codes']['Insert']>
        Relationships: []
      }
      service_area_activation_events: {
        Row: {
          id: string
          service_area_id: string | null
          previous_status: string | null
          new_status: string | null
          activated_by: string | null
          users_notified_count: number
          active_cleaner_count: number
          waitlisted_user_count: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          service_area_id?: string | null
          previous_status?: string | null
          new_status?: string | null
          activated_by?: string | null
          users_notified_count?: number
          active_cleaner_count?: number
          waitlisted_user_count?: number
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['service_area_activation_events']['Insert']>
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          id: string
          profile_id: string
          token: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          token: string
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['password_reset_tokens']['Insert']>
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          id: string
          profile_id: string
          token: string
          expires_at: string
          verified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          token: string
          expires_at: string
          verified_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_verification_tokens']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      accept_booking_request: {
        Args: { p_booking_id: string; p_tidy_pro_id: string }
        Returns: 'accepted' | 'not_found' | 'not_pending' | 'conflict' | 'taken'
      }
    }
    Enums: Record<string, never>
  }
}
