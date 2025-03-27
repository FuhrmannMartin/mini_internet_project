#!/bin/bash

if [ $# -ne 2 ]; then
    echo "$0: usage ./launch_traceroute.sh <src_grp> <dst_ip>"
    exit 1
fi

trap "exit" SIGINT

src_grp=$1
dst_ip=$2

# Path to persistent JSON file
json_file="/routes/routes.json"
timestamp=$(date "+%Y-%m-%dT%H-%M-%S")

# Temporary files
tmp_raw="/tmp/traceroute_raw.txt"
tmp_parsed="/tmp/traceroute_parsed.txt"
tmp_entry="/tmp/traceroute_entry.json"

# Step 1: Run traceroute and show live output
traceroute -i group${src_grp} "${dst_ip}" | tee "$tmp_raw"
tail -n +2 "$tmp_raw" > "$tmp_parsed"

# Step 2: Write one traceroute object to tmp_entry
{
  echo "  {"
  echo "    \"src_grp\": ${src_grp},"
  echo "    \"dst_ip\": \"${dst_ip}\","
  echo "    \"timestamp\": \"${timestamp}\","
  echo "    \"routes\": ["
} > "$tmp_entry"

total_lines=$(wc -l < "$tmp_parsed")
line_no=0

# Step 2.1: Loop manually to control trailing comma
while IFS= read -r line; do
  line_no=$((line_no + 1))

  hop=$(echo "$line" | awk '{print $1}')
  hostname=$(echo "$line" | awk '{print $2}')
  ip=$(echo "$line" | awk '{print $3}' | tr -d '()')
  rtt=$(echo "$line" | awk '{for (i=4;i<=NF;i++) if ($i ~ /^[0-9.]+$/) {print $i; break}}')

  # Defaults
  [ -z "$hostname" ] && hostname="*"
  [ -z "$ip" ] && ip="*"
  [ -z "$rtt" ] && rtt="null"

  printf '      {"hop": %d, "hostname": "%s", "ip": "%s", "rtt_ms": %s}' "$hop" "$hostname" "$ip" "$rtt" >> "$tmp_entry"

  if [ "$line_no" -lt "$total_lines" ]; then
    echo "," >> "$tmp_entry"
  else
    echo "" >> "$tmp_entry"
  fi

done < "$tmp_parsed"

echo "    ]" >> "$tmp_entry"
echo "  }" >> "$tmp_entry"

# Step 3: Append to /routes/routes.json
if [ ! -f "$json_file" ]; then
  # First element in new array
  echo "[" > "$json_file"
  cat "$tmp_entry" >> "$json_file"
  echo "]" >> "$json_file"
else
  tmp_combined="/tmp/routes_combined.json"
  head -n -1 "$json_file" > "$tmp_combined"
  echo "," >> "$tmp_combined"
  cat "$tmp_entry" >> "$tmp_combined"
  echo "]" >> "$tmp_combined"
  mv "$tmp_combined" "$json_file"
fi

# Cleanup
rm "$tmp_raw" "$tmp_parsed" "$tmp_entry"

echo "Traceroute appended to $json_file"


# for hop in `seq 30`
# do
#     echo -e 'Hop '$hop':  \c'
#     nping --interface group_"${src_grp}" --source-ip "${src_grp}".0.199.2 --dest-ip "${dst_ip}" --tr --ttl "${hop}" -c 1 -H --delay 100ms 2> /dev/null | grep RCVD | cut -f 4,7,8,9 -d ' ' | cut -f 2 -d '['
# done
