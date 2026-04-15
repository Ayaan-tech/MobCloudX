pragma circom 2.0.0;

template QoESLAVerification() {
  signal input qoe_start;
  signal input qoe_minimum;
  signal input qoe_recovery;
  signal input stall_count;
  signal input session_duration;
  signal input sla_threshold;
  signal input max_stalls;
  signal input recovery_ok_input;
  signal input stalls_ok_input;
  signal input duration_ok_input;
  signal output sla_met;

  signal recovery_ok;
  signal stalls_ok;
  signal duration_ok;
  signal combined_ok;

  recovery_ok <== recovery_ok_input;
  stalls_ok <== stalls_ok_input;
  duration_ok <== duration_ok_input;

  recovery_ok * (recovery_ok - 1) === 0;
  stalls_ok * (stalls_ok - 1) === 0;
  duration_ok * (duration_ok - 1) === 0;

  combined_ok <== recovery_ok * stalls_ok;
  sla_met <== combined_ok * duration_ok;
}

component main {public [sla_threshold, max_stalls]} = QoESLAVerification();
